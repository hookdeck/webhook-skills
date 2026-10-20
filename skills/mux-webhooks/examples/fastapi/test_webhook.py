import hashlib
import hmac
import json
import os
import time

# Set the webhook secret before importing the app.
# Mux signing secrets are opaque strings used as-is as the HMAC key.
os.environ["MUX_WEBHOOK_SECRET"] = "test_mux_signing_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_mux_signature  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["MUX_WEBHOOK_SECRET"]


def generate_mux_signature(payload: str, secret: str, timestamp: int | None = None) -> str:
    """Build a mux-signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">."""
    if timestamp is None:
        timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def event_payload(event_type: str, data_id: str = "asset_test_123") -> str:
    return json.dumps(
        {
            "type": event_type,
            "id": "3a56ac3d-33da-4366-855b-f592d898409d",
            "object": {"type": event_type.split(".")[1], "id": data_id},
            "environment": {"name": "Test", "id": "j0863n"},
            "data": {
                "id": data_id,
                "status": "ready",
                "playback_ids": [{"id": "pb_123", "policy": "public"}],
            },
            "created_at": "2026-10-20T12:00:00.000Z",
            "accessor_source": None,
            "accessor": None,
            "request_id": None,
        }
    )


def post(payload: str, signature: str | None = None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["Mux-Signature"] = signature
    return client.post("/webhooks/mux", content=payload, headers=headers)


class TestMuxWebhook:
    def test_missing_signature_returns_400(self):
        assert post(event_payload("video.asset.ready")).status_code == 400

    def test_invalid_signature_returns_400(self):
        response = post(event_payload("video.asset.ready"), f"t={int(time.time())},v1=deadbeef")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_malformed_header_returns_400(self):
        assert post(event_payload("video.asset.ready"), "not-a-valid-header").status_code == 400

    def test_wrong_secret_returns_400(self):
        payload = event_payload("video.asset.ready")
        assert post(payload, generate_mux_signature(payload, "wrong_secret")).status_code == 400

    def test_tampered_payload_returns_400(self):
        signature = generate_mux_signature(event_payload("video.asset.ready"), WEBHOOK_SECRET)
        response = post(event_payload("video.asset.ready", "asset_tampered"), signature)
        assert response.status_code == 400

    def test_expired_timestamp_returns_400(self):
        payload = event_payload("video.asset.ready")
        old = int(time.time()) - 400
        assert post(payload, generate_mux_signature(payload, WEBHOOK_SECRET, old)).status_code == 400

    def test_valid_signature_returns_200(self):
        payload = event_payload("video.asset.ready")
        response = post(payload, generate_mux_signature(payload, WEBHOOK_SECRET))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_multiple_signatures_one_valid(self):
        payload = event_payload("video.asset.ready")
        header = generate_mux_signature(payload, WEBHOOK_SECRET) + ",v1=" + "0" * 64
        assert post(payload, header).status_code == 200

    def test_handles_all_event_types(self):
        event_types = [
            "video.asset.created",
            "video.asset.ready",
            "video.asset.errored",
            "video.asset.deleted",
            "video.asset.live_stream_completed",
            "video.upload.asset_created",
            "video.live_stream.active",
            "video.live_stream.idle",
            "video.asset.track.ready",
        ]
        for event_type in event_types:
            payload = event_payload(event_type)
            response = post(payload, generate_mux_signature(payload, WEBHOOK_SECRET))
            assert response.status_code == 200, event_type

    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestVerifyMuxSignature:
    def test_matches_mux_docs_format(self):
        body = b'{"type":"video.asset.ready"}'
        ts = str(int(time.time()))
        sig = hmac.new(b"secret", ts.encode() + b"." + body, hashlib.sha256).hexdigest()
        assert verify_mux_signature(body, f"t={ts},v1={sig}", "secret")

    def test_rejects_future_timestamp(self):
        payload = event_payload("video.asset.ready")
        future = int(time.time()) + 400
        header = generate_mux_signature(payload, WEBHOOK_SECRET, future)
        assert not verify_mux_signature(payload.encode(), header, WEBHOOK_SECRET)

    def test_rejects_empty_secret(self):
        payload = event_payload("video.asset.ready")
        header = generate_mux_signature(payload, "")
        assert not verify_mux_signature(payload.encode(), header, "")
