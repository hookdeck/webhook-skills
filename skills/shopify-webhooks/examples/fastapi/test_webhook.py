import os
import json
import hmac
import hashlib
import base64
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SHOPIFY_API_SECRET"] = "test_shopify_secret"

from main import app, verify_shopify_webhook

client = TestClient(app)


def generate_shopify_signature(payload: str, secret: str) -> str:
    """Generate a valid Shopify HMAC signature for testing."""
    return base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256
        ).digest()
    ).decode("utf-8")


class TestVerifyShopifyWebhook:
    """Tests for Shopify signature verification function."""
    
    secret = os.environ["SHOPIFY_API_SECRET"]

    def test_valid_signature_returns_true(self):
        """Should return True for valid signature."""
        payload = b'{"id":123}'
        signature = generate_shopify_signature(payload.decode(), self.secret)
        
        assert verify_shopify_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        """Should return False for invalid signature."""
        payload = b'{"id":123}'
        
        assert verify_shopify_webhook(payload, "invalid_signature", self.secret) is False


class TestShopifyWebhook:
    """Tests for Shopify webhook endpoint."""
    
    secret = os.environ["SHOPIFY_API_SECRET"]

    def test_missing_signature_returns_401(self):
        """Should return 401 when signature header is missing."""
        response = client.post(
            "/webhooks/shopify",
            content='{"id":123}',
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Topic": "orders/create",
                "X-Shopify-Shop-Domain": "test.myshopify.com"
            }
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        """Should return 401 when signature is invalid."""
        payload = json.dumps({"id": 123})
        
        response = client.post(
            "/webhooks/shopify",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Hmac-SHA256": "invalid_signature",
                "X-Shopify-Topic": "orders/create",
                "X-Shopify-Shop-Domain": "test.myshopify.com"
            }
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps({"id": 123, "email": "test@example.com"})
        signature = generate_shopify_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks/shopify",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Hmac-SHA256": signature,
                "X-Shopify-Topic": "orders/create",
                "X-Shopify-Shop-Domain": "test.myshopify.com"
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_topics(self):
        """Should handle various Shopify webhook topics."""
        topics = [
            "orders/create",
            "orders/updated",
            "orders/paid",
            "products/create",
            "products/update",
            "customers/create",
            "app/uninstalled"
        ]
        
        for topic in topics:
            payload = json.dumps({"id": 456})
            signature = generate_shopify_signature(payload, self.secret)
            
            response = client.post(
                "/webhooks/shopify",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Shopify-Hmac-SHA256": signature,
                    "X-Shopify-Topic": topic,
                    "X-Shopify-Shop-Domain": "test.myshopify.com"
                }
            )
            assert response.status_code == 200, f"Failed for topic: {topic}"


class TestHealth:
    """Tests for health endpoint."""
    
    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
