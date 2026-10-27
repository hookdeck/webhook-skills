import hashlib
import hmac
import json
import os
import time

import pytest

# Set the webhook secret before importing the app.
# OpenRouter signing secrets are opaque strings used as-is (UTF-8) as the HMAC key.
os.environ["OPENROUTER_WEBHOOK_SECRET"] = "test_openrouter_signing_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["OPENROUTER_WEBHOOK_SECRET"]


def generate_signature(payload: bytes, secret: str, timestamp: int | None = None) -> str:
    """Build an X-OpenRouter-Signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>," + body>."""
    if timestamp is None:
        timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), str(timestamp).encode() + b"," + payload, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def event_payload(event_type: str, job_id: str = "job_test_123") -> bytes:
    status = event_type.split(".")[2]
    data = {
        "id": job_id,
        "status": status,
        "generation_id": "gen-123",
        "model": "google/veo-3.1-lite",
        "usage": {"cost": 0.4, "is_byok": False},
    }
    if status == "completed":
        data["unsigned_urls"] = ["https://example.com/video.mp4"]
    if status == "failed":
        data["error"] = "provider error"
    return json.dumps(
        {"type": event_type, "created_at": "2026-10-26T12:00:00.000Z", "data": data}
    ).encode()


def post(payload: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {
        "Content-Type": content_type,
        "X-OpenRouter-Idempotency-Key": "job_test_123-completed",
    }
    if signature is not None:
        headers["X-OpenRouter-Signature"] = signature
    return client.post("/webhooks/openrouter", content=payload, headers=headers)


class TestOpenRouterWebhook:
    def test_missing_signature_returns_401(self):
        assert post(event_payload("video.generation.completed")).status_code == 401

    def test_empty_signature_returns_401(self):
        assert post(event_payload("video.generation.completed"), "").status_code == 401

    def test_malformed_header_returns_401(self):
        assert post(event_payload("video.generation.completed"), "not-a-valid-header").status_code == 401

    def test_missing_t_or_v1_returns_401(self):
        payload = event_payload("video.generation.completed")
        t, v1 = generate_signature(payload, WEBHOOK_SECRET).split(",")
        assert post(payload, v1).status_code == 401
        assert post(payload, t).status_code == 401

    def test_short_signature_returns_401(self):
        t = int(time.time())
        assert post(event_payload("video.generation.completed"), f"t={t},v1=deadbeef").status_code == 401

    def test_non_hex_signature_returns_401(self):
        t = int(time.time())
        assert post(event_payload("video.generation.completed"), f"t={t},v1={'z' * 64}").status_code == 401

    def test_wrong_secret_returns_401(self):
        payload = event_payload("video.generation.completed")
        assert post(payload, generate_signature(payload, "wrong_secret")).status_code == 401

    def test_tampered_payload_returns_401(self):
        signature = generate_signature(event_payload("video.generation.completed"), WEBHOOK_SECRET)
        tampered = event_payload("video.generation.completed", "job_tampered")
        assert post(tampered, signature).status_code == 401

    def test_dot_separator_returns_401(self):
        payload = event_payload("video.generation.completed")
        t = int(time.time())
        v1 = hmac.new(
            WEBHOOK_SECRET.encode(), str(t).encode() + b"." + payload, hashlib.sha256
        ).hexdigest()
        assert post(payload, f"t={t},v1={v1}").status_code == 401

    def test_valid_signature_returns_204(self):
        payload = event_payload("video.generation.completed")
        response = post(payload, generate_signature(payload, WEBHOOK_SECRET))
        assert response.status_code == 204

    def test_uppercase_hex_is_accepted(self):
        payload = event_payload("video.generation.completed")
        t = int(time.time())
        sig = generate_signature(payload, WEBHOOK_SECRET, t).split("v1=")[1].upper()
        assert post(payload, f"t={t},v1={sig}").status_code == 204

    def test_multiple_v1_values_if_one_matches(self):
        payload = event_payload("video.generation.completed")
        valid = generate_signature(payload, WEBHOOK_SECRET)
        assert post(payload, f"{valid},v1={'0' * 64}").status_code == 204

    def test_any_content_type_verifies_exact_bytes(self):
        payload = event_payload("video.generation.completed")
        response = post(payload, generate_signature(payload, WEBHOOK_SECRET), "text/plain")
        assert response.status_code == 204

    def test_non_ascii_body_verifies_byte_for_byte(self):
        payload = json.dumps(
            {"type": "video.generation.failed", "data": {"id": "j", "status": "failed", "error": "échec 失败 ✓"}},
            ensure_ascii=False,
        ).encode("utf-8")
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET)).status_code == 204

    def test_old_timestamp_is_accepted_by_default(self):
        # Retries and replays resend the original timestamp, so no window by default
        payload = event_payload("video.generation.completed")
        old = int(time.time()) - 86400
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET, old)).status_code == 204

    def test_old_timestamp_rejected_when_tolerance_enabled(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_WEBHOOK_TOLERANCE_SECONDS", "300")
        payload = event_payload("video.generation.completed")
        old = int(time.time()) - 400
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET, old)).status_code == 401
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET)).status_code == 204

    def test_signed_non_json_body_returns_400(self):
        payload = b"not json"
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET)).status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        [
            "video.generation.completed",
            "video.generation.failed",
            "video.generation.cancelled",
            "video.generation.expired",
            "video.generation.something_new",
        ],
    )
    def test_documented_and_unknown_events(self, event_type):
        payload = event_payload(event_type)
        assert post(payload, generate_signature(payload, WEBHOOK_SECRET)).status_code == 204


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
