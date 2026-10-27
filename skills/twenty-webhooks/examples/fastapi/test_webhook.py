import hashlib
import hmac
import json
import os
import time

import pytest

# Set the webhook secret before importing the app.
# Twenty webhook secrets are opaque strings used as-is (UTF-8) as the HMAC key.
os.environ["TWENTY_WEBHOOK_SECRET"] = "test_twenty_webhook_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["TWENTY_WEBHOOK_SECRET"]


def now_ms() -> int:
    return int(time.time() * 1000)


def generate_signature(payload: bytes, secret: str, timestamp: int | str) -> str:
    """Bare hex HMAC-SHA256 of "<timestamp>:" + raw body. The timestamp is Unix milliseconds."""
    return hmac.new(
        secret.encode(), str(timestamp).encode() + b":" + payload, hashlib.sha256
    ).hexdigest()


def event_payload(event_name: str, record_id: str = "abc12345") -> bytes:
    return json.dumps(
        {
            "eventName": event_name,
            "workspaceId": "ws_123",
            "webhookId": "wh_123",
            "eventDate": "2026-10-26T12:00:00.000Z",
            "record": {"id": record_id, "name": "Acme"},
        }
    ).encode()


def signed(payload: bytes, secret: str = WEBHOOK_SECRET, timestamp: int | None = None) -> dict:
    ts = now_ms() if timestamp is None else timestamp
    return {"signature": generate_signature(payload, secret, ts), "timestamp": str(ts)}


def post(payload: bytes, signature: str | None = None, timestamp: str | None = None,
         content_type: str = "application/json"):
    headers = {"Content-Type": content_type, "X-Twenty-Webhook-Nonce": "nonce-123"}
    if signature is not None:
        headers["X-Twenty-Webhook-Signature"] = signature
    if timestamp is not None:
        headers["X-Twenty-Webhook-Timestamp"] = timestamp
    return client.post("/webhooks/twenty", content=payload, headers=headers)


class TestTwentyWebhook:
    def test_missing_signature_header(self):
        payload = event_payload("person.created")
        assert post(payload, timestamp=str(now_ms())).status_code == 401

    def test_missing_timestamp_header(self):
        payload = event_payload("person.created")
        assert post(payload, signature=signed(payload)["signature"]).status_code == 401

    def test_empty_timestamp_header(self):
        payload = event_payload("person.created")
        assert post(payload, signature=signed(payload)["signature"], timestamp="").status_code == 401

    def test_wrong_secret(self):
        payload = event_payload("person.created")
        assert post(payload, **signed(payload, "wrong_secret")).status_code == 401

    def test_tampered_body(self):
        payload = event_payload("person.created")
        assert post(payload.replace(b"Acme", b"Evil"), **signed(payload)).status_code == 401

    def test_timestamp_header_differs_from_signed_one(self):
        payload = event_payload("person.created")
        s = signed(payload)
        assert post(payload, s["signature"], str(int(s["timestamp"]) + 1)).status_code == 401

    def test_signature_not_64_hex_characters(self):
        payload = event_payload("person.created")
        s = signed(payload)
        for bad in [s["signature"][:62], s["signature"] + "00", "sha256=" + s["signature"],
                    s["signature"][:63] + "z"]:
            assert post(payload, bad, s["timestamp"]).status_code == 401

    @pytest.mark.parametrize("event_name", [
        "person.created",
        "person.deleted",
        "company.updated",
        "opportunity.updated",
        "note.created",
        "workflow.created",
    ])
    def test_valid_event(self, event_name):
        payload = event_payload(event_name)
        assert post(payload, **signed(payload)).status_code == 200

    def test_uppercase_hex_signature(self):
        payload = event_payload("person.created")
        s = signed(payload)
        assert post(payload, s["signature"].upper(), s["timestamp"]).status_code == 200

    def test_exact_raw_bytes_are_verified(self):
        payload = '{\n  "eventName": "person.created",\n  "record": { "id": "1", "name": "Zoë 😀" }\n}'.encode()
        assert post(payload, **signed(payload)).status_code == 200

    def test_any_content_type(self):
        payload = event_payload("person.created")
        assert post(payload, content_type="text/plain", **signed(payload)).status_code == 200

    def test_docs_style_event_field(self):
        payload = json.dumps({"event": "company.updated", "data": {"id": "c1"},
                              "timestamp": "2026-10-26T12:00:00Z"}).encode()
        assert post(payload, **signed(payload)).status_code == 200

    def test_signed_body_that_is_not_json(self):
        payload = b"not json"
        assert post(payload, content_type="text/plain", **signed(payload)).status_code == 400

    def test_old_timestamps_accepted_by_default(self):
        payload = event_payload("person.created")
        s = signed(payload, timestamp=now_ms() - 24 * 3600 * 1000)
        assert post(payload, **s).status_code == 200

    def test_tolerance_is_opt_in(self, monkeypatch):
        monkeypatch.setenv("TWENTY_WEBHOOK_TOLERANCE_SECONDS", "300")
        payload = event_payload("person.created")
        old = signed(payload, timestamp=now_ms() - 10 * 60 * 1000)
        assert post(payload, **old).status_code == 401
        assert post(payload, **signed(payload)).status_code == 200

    def test_timestamp_is_milliseconds_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("TWENTY_WEBHOOK_TOLERANCE_SECONDS", "300")
        payload = event_payload("person.created")
        # Unix seconds (1000x too small) would be decades old in milliseconds
        assert post(payload, **signed(payload, timestamp=int(time.time()))).status_code == 401

    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
