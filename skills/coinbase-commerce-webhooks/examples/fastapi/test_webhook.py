import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["COINBASE_COMMERCE_WEBHOOK_SECRET"] = "test_shared_secret"

from main import app  # noqa: E402

client = TestClient(app)

WEBHOOK_SECRET = os.environ["COINBASE_COMMERCE_WEBHOOK_SECRET"]


def generate_signature(payload: str, secret: str) -> str:
    """Generate a valid Coinbase Commerce signature for testing.

    Coinbase Commerce signs the raw body with HMAC-SHA256 (hex).
    """
    return hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def build_body(event_type: str, charge_id: str = "charge_123") -> str:
    """Build a webhook body with the event nested under `event`."""
    return json.dumps(
        {
            "id": "notification_123",
            "scheduled_for": "2023-08-30T19:29:20Z",
            "event": {
                "id": "evt_123",
                "resource": "event",
                "type": event_type,
                "api_version": "2018-03-22",
                "created_at": "2023-08-30T19:29:20Z",
                "data": {"id": charge_id, "code": "XA6G6ZFR"},
            },
        }
    )


class TestCoinbaseCommerceWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/coinbase-commerce",
            content=build_body("charge:confirmed"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing X-CC-Webhook-Signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/coinbase-commerce",
            content=build_body("charge:confirmed"),
            headers={
                "Content-Type": "application/json",
                "X-CC-Webhook-Signature": "deadbeef",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = build_body("charge:confirmed", "charge_original")
        signature = generate_signature(original, WEBHOOK_SECRET)
        tampered = build_body("charge:confirmed", "charge_tampered")

        response = client.post(
            "/webhooks/coinbase-commerce",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-CC-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = build_body("charge:confirmed")
        signature = generate_signature(body, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/coinbase-commerce",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-CC-Webhook-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_charge_event_types(self):
        event_types = [
            "charge:created",
            "charge:pending",
            "charge:confirmed",
            "charge:failed",
            "charge:delayed",
            "charge:resolved",
            "charge:unknown",
        ]

        for event_type in event_types:
            body = build_body(event_type)
            signature = generate_signature(body, WEBHOOK_SECRET)

            response = client.post(
                "/webhooks/coinbase-commerce",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-CC-Webhook-Signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
