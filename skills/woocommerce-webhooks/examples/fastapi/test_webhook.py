import pytest
import os
import json
import hmac
import hashlib
import base64
from fastapi.testclient import TestClient
from main import app, verify_woocommerce_webhook

# Test webhook secret
TEST_SECRET = 'test_woocommerce_secret_key'

# Set test environment variable
os.environ['WOOCOMMERCE_WEBHOOK_SECRET'] = TEST_SECRET

client = TestClient(app)

def generate_test_signature(payload: str, secret: str) -> str:
    """
    Generate a valid WooCommerce webhook signature for testing
    
    Args:
        payload: JSON payload as string
        secret: Webhook secret
    
    Returns:
        Base64 encoded signature
    """
    hash_digest = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(hash_digest).decode('utf-8')

class TestSignatureVerification:
    def test_should_verify_valid_signatures(self):
        payload = '{"id": 123, "status": "processing"}'
        signature = generate_test_signature(payload, TEST_SECRET)
        
        is_valid = verify_woocommerce_webhook(
            payload.encode('utf-8'),
            signature,
            TEST_SECRET
        )
        
        assert is_valid is True
    
    def test_should_reject_invalid_signatures(self):
        payload = '{"id": 123, "status": "processing"}'
        invalid_signature = 'invalid_signature'
        
        is_valid = verify_woocommerce_webhook(
            payload.encode('utf-8'),
            invalid_signature,
            TEST_SECRET
        )
        
        assert is_valid is False
    
    def test_should_reject_missing_signature(self):
        payload = '{"id": 123, "status": "processing"}'
        
        is_valid = verify_woocommerce_webhook(
            payload.encode('utf-8'),
            None,
            TEST_SECRET
        )
        
        assert is_valid is False
    
    def test_should_reject_missing_secret(self):
        payload = '{"id": 123, "status": "processing"}'
        signature = generate_test_signature(payload, TEST_SECRET)
        
        is_valid = verify_woocommerce_webhook(
            payload.encode('utf-8'),
            signature,
            None
        )
        
        assert is_valid is False
    
    def test_should_handle_different_payload_lengths(self):
        payloads = [
            '{}',
            '{"id":1}',
            '{"id": 123, "status": "processing", "total": "29.99", "customer": {"name": "John Doe"}}'
        ]
        
        for payload in payloads:
            signature = generate_test_signature(payload, TEST_SECRET)
            is_valid = verify_woocommerce_webhook(
                payload.encode('utf-8'),
                signature,
                TEST_SECRET
            )
            assert is_valid is True

class TestWebhookEndpoint:
    def test_should_accept_valid_order_created_webhook(self):
        payload = {
            "id": 123,
            "status": "processing",
            "total": "29.99",
            "currency": "USD",
            "billing": {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.com"
            }
        }
        
        # Convert to JSON string for signature generation
        payload_string = json.dumps(payload, separators=(',', ':'))
        signature = generate_test_signature(payload_string, TEST_SECRET)
        
        # Send the raw JSON string, not using json= parameter
        response = client.post(
            "/webhooks/woocommerce",
            content=payload_string,
            headers={
                "Content-Type": "application/json",
                "X-WC-Webhook-Topic": "order.created",
                "X-WC-Webhook-Signature": signature,
                "X-WC-Webhook-Source": "https://example.com"
            }
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}
    
    def test_should_accept_valid_product_updated_webhook(self):
        payload = {
            "id": 456,
            "name": "Premium T-Shirt",
            "status": "publish",
            "regular_price": "29.99",
            "stock_status": "instock"
        }
        
        # Convert to JSON string for signature generation
        payload_string = json.dumps(payload, separators=(',', ':'))
        signature = generate_test_signature(payload_string, TEST_SECRET)
        
        # Send the raw JSON string, not using json= parameter
        response = client.post(
            "/webhooks/woocommerce",
            content=payload_string,
            headers={
                "Content-Type": "application/json",
                "X-WC-Webhook-Topic": "product.updated",
                "X-WC-Webhook-Signature": signature,
                "X-WC-Webhook-Source": "https://example.com"
            }
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}
    
    def test_should_reject_webhook_with_invalid_signature(self):
        payload = {
            "id": 123,
            "status": "processing"
        }
        
        payload_string = json.dumps(payload, separators=(',', ':'))
        
        response = client.post(
            "/webhooks/woocommerce",
            content=payload_string,
            headers={
                "Content-Type": "application/json",
                "X-WC-Webhook-Topic": "order.created",
                "X-WC-Webhook-Signature": "invalid_signature",
                "X-WC-Webhook-Source": "https://example.com"
            }
        )
        
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}
    
    def test_should_reject_webhook_without_signature_header(self):
        payload = {
            "id": 123,
            "status": "processing"
        }
        
        payload_string = json.dumps(payload, separators=(',', ':'))
        
        response = client.post(
            "/webhooks/woocommerce",
            content=payload_string,
            headers={
                "Content-Type": "application/json",
                "X-WC-Webhook-Topic": "order.created",
                "X-WC-Webhook-Source": "https://example.com"
            }
        )
        
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}

class TestHealthCheck:
    def test_should_return_healthy_status(self):
        response = client.get("/health")
        
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        assert "timestamp" in response.json()