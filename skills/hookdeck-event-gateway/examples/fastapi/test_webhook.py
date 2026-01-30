import os
import json
import hmac
import hashlib
import base64
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["HOOKDECK_WEBHOOK_SECRET"] = "test_hookdeck_secret"

from main import app, verify_hookdeck_signature

client = TestClient(app)


def generate_hookdeck_signature(payload: str, secret: str) -> str:
    """Generate a valid Hookdeck signature for testing (base64 HMAC SHA-256)."""
    return base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256
        ).digest()
    ).decode("utf-8")


class TestVerifyHookdeckSignature:
    """Tests for Hookdeck signature verification function."""
    
    secret = os.environ["HOOKDECK_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        """Should return True for valid signature."""
        payload = b'{"type":"test"}'
        signature = generate_hookdeck_signature(payload.decode(), self.secret)
        
        assert verify_hookdeck_signature(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        """Should return False for invalid signature."""
        payload = b'{"type":"test"}'
        
        assert verify_hookdeck_signature(payload, "invalid_signature", self.secret) is False


class TestHookdeckWebhook:
    """Tests for Hookdeck webhook endpoint."""
    
    secret = os.environ["HOOKDECK_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        """Should return 401 when signature header is missing."""
        response = client.post(
            "/webhooks",
            content='{"type":"test"}',
            headers={
                "Content-Type": "application/json",
                "X-Hookdeck-Event-Id": "evt_123",
                "X-Hookdeck-Source-Id": "src_123"
            }
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        """Should return 401 when signature is invalid."""
        payload = json.dumps({"type": "payment_intent.succeeded"})
        
        response = client.post(
            "/webhooks",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hookdeck-Signature": "invalid_signature",
                "X-Hookdeck-Event-Id": "evt_123",
                "X-Hookdeck-Source-Id": "src_123"
            }
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps({
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_123"}}
        })
        signature = generate_hookdeck_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hookdeck-Signature": signature,
                "X-Hookdeck-Event-Id": "evt_123",
                "X-Hookdeck-Source-Id": "src_123",
                "X-Hookdeck-Attempt-Number": "1"
            }
        )
        assert response.status_code == 200
        assert response.json()["received"] is True
        assert response.json()["eventId"] == "evt_123"

    def test_handles_stripe_style_events(self):
        """Should handle Stripe-style events."""
        payload = json.dumps({
            "type": "customer.subscription.created",
            "data": {"object": {"id": "sub_123"}}
        })
        signature = generate_hookdeck_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hookdeck-Signature": signature,
                "X-Hookdeck-Event-Id": "evt_456",
                "X-Hookdeck-Source-Id": "src_stripe"
            }
        )
        assert response.status_code == 200

    def test_handles_shopify_style_events(self):
        """Should handle Shopify-style events."""
        payload = json.dumps({
            "id": 123456,
            "email": "test@example.com"
        })
        signature = generate_hookdeck_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hookdeck-Signature": signature,
                "X-Hookdeck-Event-Id": "evt_789",
                "X-Hookdeck-Source-Id": "src_shopify"
            }
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for health endpoint."""
    
    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
