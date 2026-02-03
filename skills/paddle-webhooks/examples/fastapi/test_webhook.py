import os
import hmac
import hashlib
import time
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PADDLE_WEBHOOK_SECRET"] = "test_secret_key"

from main import app, verify_paddle_signature

client = TestClient(app)


def generate_paddle_signature(payload: str, secret: str) -> str:
    """Generate a valid Paddle signature for testing."""
    timestamp = int(time.time())
    signed_payload = f"{timestamp}:{payload}"
    signature = hmac.new(
        secret.encode(), signed_payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"ts={timestamp};h1={signature}"


class TestVerifyPaddleSignature:
    webhook_secret = "test_secret_key"

    def test_valid_signature(self):
        payload = '{"event_type":"test"}'
        signature = generate_paddle_signature(payload, self.webhook_secret)

        assert verify_paddle_signature(payload, signature, self.webhook_secret) is True

    def test_invalid_signature(self):
        payload = '{"event_type":"test"}'
        signature = "ts=123;h1=invalid_signature"

        assert verify_paddle_signature(payload, signature, self.webhook_secret) is False

    def test_missing_signature_header(self):
        payload = '{"event_type":"test"}'

        assert verify_paddle_signature(payload, None, self.webhook_secret) is False
        assert verify_paddle_signature(payload, "", self.webhook_secret) is False

    def test_malformed_signature_header(self):
        payload = '{"event_type":"test"}'

        assert verify_paddle_signature(payload, "invalid", self.webhook_secret) is False
        assert verify_paddle_signature(payload, "ts=123", self.webhook_secret) is False

    def test_tampered_payload(self):
        original_payload = '{"event_type":"test","data":{"id":"123"}}'
        tampered_payload = '{"event_type":"test","data":{"id":"456"}}'
        signature = generate_paddle_signature(original_payload, self.webhook_secret)

        assert (
            verify_paddle_signature(tampered_payload, signature, self.webhook_secret)
            is False
        )

    def test_multiple_h1_signatures(self):
        """Test handling of multiple h1 signatures during rotation."""
        payload = '{"event_type":"test"}'
        timestamp = int(time.time())
        signed_payload = f"{timestamp}:{payload}"

        valid_signature = hmac.new(
            self.webhook_secret.encode(), signed_payload.encode(), hashlib.sha256
        ).hexdigest()

        # Include an old invalid signature and a new valid one
        signature = f"ts={timestamp};h1=old_invalid_signature;h1={valid_signature}"

        assert verify_paddle_signature(payload, signature, self.webhook_secret) is True


class TestPaddleWebhookEndpoint:
    webhook_secret = os.environ["PADDLE_WEBHOOK_SECRET"]

    def test_missing_signature_returns_400(self):
        response = client.post("/webhooks/paddle", json={"event_type": "test"})

        assert response.status_code == 400
        assert "Missing Paddle-Signature header" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = '{"event_type":"subscription.created","data":{"id":"sub_123"}}'

        response = client.post(
            "/webhooks/paddle",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Paddle-Signature": "ts=123;h1=invalid_signature",
            },
        )

        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original_payload = (
            '{"event_type":"subscription.created","data":{"id":"sub_123"}}'
        )
        tampered_payload = (
            '{"event_type":"subscription.created","data":{"id":"sub_tampered"}}'
        )
        signature = generate_paddle_signature(original_payload, self.webhook_secret)

        response = client.post(
            "/webhooks/paddle",
            content=tampered_payload,
            headers={"Content-Type": "application/json", "Paddle-Signature": signature},
        )

        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = '{"event_type":"subscription.created","data":{"id":"sub_valid"}}'
        signature = generate_paddle_signature(payload, self.webhook_secret)

        response = client.post(
            "/webhooks/paddle",
            content=payload,
            headers={"Content-Type": "application/json", "Paddle-Signature": signature},
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        event_types = [
            "subscription.created",
            "subscription.activated",
            "subscription.canceled",
            "subscription.paused",
            "subscription.resumed",
            "transaction.completed",
            "transaction.payment_failed",
            "unknown.event.type",
        ]

        for event_type in event_types:
            payload = f'{{"event_type":"{event_type}","data":{{"id":"obj_123"}}}}'
            signature = generate_paddle_signature(payload, self.webhook_secret)

            response = client.post(
                "/webhooks/paddle",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Paddle-Signature": signature,
                },
            )

            assert response.status_code == 200


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
