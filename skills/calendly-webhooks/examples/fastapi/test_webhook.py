import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["CALENDLY_WEBHOOK_SIGNING_KEY"] = "test_signing_key"

from main import app, verify_calendly_signature

client = TestClient(app)

SIGNING_KEY = os.environ["CALENDLY_WEBHOOK_SIGNING_KEY"]


def generate_calendly_signature(payload: str, secret: str, timestamp: int | None = None) -> str:
    """Generate a valid Calendly signature header for testing.

    Format: t=<timestamp>,v1=<hmac-sha256 hex of "{timestamp}.{payload}">
    """
    if timestamp is None:
        timestamp = int(time.time())
    signature = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


class TestCalendlyWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/calendly",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event": "invitee.created"})
        response = client.post(
            "/webhooks/calendly",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Calendly-Webhook-Signature": "t=9999999999,v1=deadbeef",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"event": "invitee.created", "payload": {"email": "jane@example.com"}})
        signature = generate_calendly_signature(original, SIGNING_KEY)
        tampered = json.dumps({"event": "invitee.created", "payload": {"email": "attacker@example.com"}})
        response = client.post(
            "/webhooks/calendly",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "Calendly-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"event": "invitee.created"})
        old_ts = int(time.time()) - 400
        signature = generate_calendly_signature(payload, SIGNING_KEY, timestamp=old_ts)
        response = client.post(
            "/webhooks/calendly",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Calendly-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"event": "invitee.created", "payload": {"email": "jane@example.com"}})
        signature = generate_calendly_signature(payload, SIGNING_KEY)
        response = client.post(
            "/webhooks/calendly",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Calendly-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_event_types(self):
        event_types = [
            "invitee.created",
            "invitee.canceled",
            "invitee_no_show.created",
            "routing_form_submission.created",
            "unknown.event",
        ]
        for event_type in event_types:
            payload = json.dumps({"event": event_type, "payload": {"email": "jane@example.com"}})
            signature = generate_calendly_signature(payload, SIGNING_KEY)
            response = client.post(
                "/webhooks/calendly",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Calendly-Webhook-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestVerifyHelper:
    def test_validates_correct_signature(self):
        payload = json.dumps({"event": "invitee.created"})
        header = generate_calendly_signature(payload, SIGNING_KEY)
        assert verify_calendly_signature(payload.encode("utf-8"), header, SIGNING_KEY) is True

    def test_rejects_malformed_header(self):
        payload = json.dumps({"event": "invitee.created"})
        assert verify_calendly_signature(payload.encode("utf-8"), "not-valid", SIGNING_KEY) is False

    def test_rejects_missing_header(self):
        assert verify_calendly_signature(b"{}", None, SIGNING_KEY) is False


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
