import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# Set test environment variables before importing the app. The notification URL
# is part of the signed content, so tests must sign with the same value the app
# verifies against.
os.environ["SQUARE_WEBHOOK_SIGNATURE_KEY"] = "test_signature_key"
os.environ["SQUARE_WEBHOOK_URL"] = "https://example.com/webhooks/square"

from main import app, verify_square_signature

client = TestClient(app)

SIGNATURE_KEY = os.environ["SQUARE_WEBHOOK_SIGNATURE_KEY"]
NOTIFICATION_URL = os.environ["SQUARE_WEBHOOK_URL"]


def generate_square_signature(
    body: str, key: str = SIGNATURE_KEY, url: str = NOTIFICATION_URL
) -> str:
    """Generate a valid Square signature: base64(HMAC-SHA256(url + body, key))."""
    payload = (url + body).encode("utf-8")
    digest = hmac.new(key.encode("utf-8"), payload, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


class TestVerifySquareSignature:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        body = '{"type":"payment.created"}'
        signature = generate_square_signature(body)
        assert (
            verify_square_signature(
                body.encode(), signature, SIGNATURE_KEY, NOTIFICATION_URL
            )
            is True
        )

    def test_invalid_signature_returns_false(self):
        body = '{"type":"payment.created"}'
        assert (
            verify_square_signature(
                body.encode(), "invalid_signature", SIGNATURE_KEY, NOTIFICATION_URL
            )
            is False
        )

    def test_wrong_notification_url_returns_false(self):
        body = '{"type":"payment.created"}'
        signature = generate_square_signature(body, url="https://evil.com/webhooks/square")
        assert (
            verify_square_signature(
                body.encode(), signature, SIGNATURE_KEY, NOTIFICATION_URL
            )
            is False
        )


class TestSquareWebhook:
    """Tests for the Square webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/square",
            content='{"type":"payment.created"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        body = json.dumps({"type": "payment.created"})
        response = client.post(
            "/webhooks/square",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-square-hmacsha256-signature": "invalid_signature",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_body_returns_400(self):
        original = json.dumps({"type": "payment.updated", "amount": 100})
        signature = generate_square_signature(original)
        tampered = json.dumps({"type": "payment.updated", "amount": 999})
        response = client.post(
            "/webhooks/square",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "x-square-hmacsha256-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = json.dumps(
            {"type": "payment.updated", "event_id": "evt_123", "data": {"id": "pay_abc"}}
        )
        signature = generate_square_signature(body)
        response = client.post(
            "/webhooks/square",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-square-hmacsha256-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_common_event_types(self):
        event_types = [
            "payment.created",
            "payment.updated",
            "refund.created",
            "refund.updated",
            "invoice.payment_made",
            "order.created",
            "order.updated",
            "customer.created",
        ]
        for event_type in event_types:
            body = json.dumps(
                {"type": event_type, "event_id": f"evt_{event_type}", "data": {"id": "obj_1"}}
            )
            signature = generate_square_signature(body)
            response = client.post(
                "/webhooks/square",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "x-square-hmacsha256-signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
