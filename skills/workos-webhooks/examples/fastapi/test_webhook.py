import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["WORKOS_WEBHOOK_SECRET"] = "wh_test_secret"

from main import app

client = TestClient(app)


def generate_workos_signature(payload: str, secret: str, timestamp_ms: int = None) -> str:
    """Generate a valid WorkOS signature for testing.

    Format: "t=<ms timestamp>, v1=<hex HMAC-SHA256 of `${t}.${payload}`>".
    The timestamp is in MILLISECONDS.
    """
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)
    signed_content = f"{timestamp_ms}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed_content.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp_ms}, v1={signature}"


class TestWorkOSWebhook:
    """Tests for the WorkOS webhook endpoint."""

    webhook_secret = os.environ["WORKOS_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/workos",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing WorkOS-Signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps(
            {"id": "event_test", "event": "dsync.user.created", "data": {"id": "du_1"}}
        )
        response = client.post(
            "/webhooks/workos",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "WorkOS-Signature": f"t={int(time.time() * 1000)}, v1=invalidsignature",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps(
            {"id": "event_test", "event": "dsync.user.created", "data": {"id": "du_1"}}
        )
        signature = generate_workos_signature(original, self.webhook_secret)
        tampered = json.dumps(
            {"id": "event_test", "event": "dsync.user.created", "data": {"id": "du_tampered"}}
        )
        response = client.post(
            "/webhooks/workos",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "WorkOS-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps(
            {"id": "event_test", "event": "dsync.user.created", "data": {"id": "du_1"}}
        )
        # 5 minutes ago — outside the 3 minute default tolerance
        stale = int(time.time() * 1000) - 5 * 60 * 1000
        signature = generate_workos_signature(payload, self.webhook_secret, stale)
        response = client.post(
            "/webhooks/workos",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "WorkOS-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "id": "event_test_valid",
                "event": "dsync.user.created",
                "data": {"id": "du_valid"},
            }
        )
        signature = generate_workos_signature(payload, self.webhook_secret)
        response = client.post(
            "/webhooks/workos",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "WorkOS-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        event_types = [
            "dsync.user.created",
            "dsync.group.user_added",
            "connection.activated",
            "user.created",
            "session.created",
            "unknown.event.type",
        ]
        for event_type in event_types:
            payload = json.dumps(
                {
                    "id": f"event_{event_type.replace('.', '_')}",
                    "event": event_type,
                    "data": {"id": "obj_123"},
                }
            )
            signature = generate_workos_signature(payload, self.webhook_secret)
            response = client.post(
                "/webhooks/workos",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "WorkOS-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
