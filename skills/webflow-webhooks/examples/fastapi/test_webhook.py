import os
import json
import hmac
import hashlib
import time
import pytest
from fastapi.testclient import TestClient
from main import app, verify_webflow_signature

# Set test environment
os.environ["WEBFLOW_WEBHOOK_SECRET"] = "test_webhook_secret_key"

client = TestClient(app)
webhook_secret = "test_webhook_secret_key"


def generate_signature(payload: str, timestamp: str, secret: str = webhook_secret) -> str:
    """Generate a valid Webflow signature for testing"""
    signed_content = f"{timestamp}:{payload}"
    return hmac.new(
        secret.encode('utf-8'),
        signed_content.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def create_webhook_request(
    payload: dict,
    timestamp: str = None,
    signature: str = None,
    secret: str = None
) -> dict:
    """Create webhook request headers and body"""
    payload_str = json.dumps(payload)
    timestamp = timestamp or str(int(time.time() * 1000))
    signature = signature or generate_signature(payload_str, timestamp, secret or webhook_secret)

    return {
        "headers": {
            "x-webflow-signature": signature,
            "x-webflow-timestamp": timestamp,
            "content-type": "application/json"
        },
        "data": payload_str
    }


class TestWebflowWebhook:
    def test_valid_webhook(self):
        """Test webhook with valid signature"""
        payload = {
            "triggerType": "form_submission",
            "payload": {
                "name": "Contact Form",
                "siteId": "123456",
                "data": {
                    "email": "test@example.com",
                    "message": "Test message"
                },
                "submittedAt": "2024-01-15T12:00:00.000Z",
                "id": "form123"
            }
        }

        request_data = create_webhook_request(payload)
        response = client.post(
            "/webhooks/webflow",
            headers=request_data["headers"],
            content=request_data["data"]
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_different_event_types(self):
        """Test handling of different event types"""
        event_types = [
            {
                "triggerType": "ecomm_new_order",
                "payload": {
                    "orderId": "order123",
                    "total": 99.99,
                    "currency": "USD"
                }
            },
            {
                "triggerType": "collection_item_created",
                "payload": {
                    "_id": "item123",
                    "name": "New Item",
                    "_cid": "collection123"
                }
            },
            {
                "triggerType": "site_publish",
                "payload": {}
            },
            {
                "triggerType": "user_account_added",
                "payload": {
                    "userId": "user123"
                }
            }
        ]

        for event in event_types:
            request_data = create_webhook_request(event)
            response = client.post(
                "/webhooks/webflow",
                headers=request_data["headers"],
                content=request_data["data"]
            )
            assert response.status_code == 200

    def test_invalid_signature(self):
        """Test webhook with invalid signature"""
        payload = {"triggerType": "test", "payload": {}}
        request_data = create_webhook_request(payload, signature="invalid_signature")

        response = client.post(
            "/webhooks/webflow",
            headers=request_data["headers"],
            content=request_data["data"]
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_missing_signature_header(self):
        """Test webhook with missing signature header"""
        response = client.post(
            "/webhooks/webflow",
            headers={
                "x-webflow-timestamp": str(int(time.time() * 1000)),
                "content-type": "application/json"
            },
            json={"triggerType": "test", "payload": {}}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing required headers"

    def test_missing_timestamp_header(self):
        """Test webhook with missing timestamp header"""
        response = client.post(
            "/webhooks/webflow",
            headers={
                "x-webflow-signature": "some_signature",
                "content-type": "application/json"
            },
            json={"triggerType": "test", "payload": {}}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing required headers"

    def test_expired_timestamp(self):
        """Test webhook with expired timestamp (older than 5 minutes)"""
        payload = {"triggerType": "test", "payload": {}}
        old_timestamp = str(int(time.time() * 1000) - 400000)  # 6+ minutes old (400000 ms)
        request_data = create_webhook_request(payload, timestamp=old_timestamp)

        response = client.post(
            "/webhooks/webflow",
            headers=request_data["headers"],
            content=request_data["data"]
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_recent_timestamp(self):
        """Test webhook with timestamp within 5-minute window"""
        payload = {"triggerType": "test", "payload": {}}
        recent_timestamp = str(int(time.time() * 1000) - 250000)  # 4 minutes old (250000 ms)
        request_data = create_webhook_request(payload, timestamp=recent_timestamp)

        response = client.post(
            "/webhooks/webflow",
            headers=request_data["headers"],
            content=request_data["data"]
        )

        assert response.status_code == 200

    def test_wrong_secret(self):
        """Test webhook with wrong secret"""
        payload = {"triggerType": "test", "payload": {}}
        request_data = create_webhook_request(payload, secret="wrong_secret")

        response = client.post(
            "/webhooks/webflow",
            headers=request_data["headers"],
            content=request_data["data"]
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_json(self):
        """Test webhook with invalid JSON"""
        timestamp = str(int(time.time() * 1000))
        invalid_json = "not valid json"
        signature = generate_signature(invalid_json, timestamp)

        response = client.post(
            "/webhooks/webflow",
            headers={
                "x-webflow-signature": signature,
                "x-webflow-timestamp": timestamp,
                "content-type": "application/json"
            },
            content=invalid_json
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data

    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Webflow Webhook Handler"
        assert "endpoints" in data


class TestSignatureVerification:
    def test_verify_valid_signature(self):
        """Test signature verification with valid inputs"""
        payload = "test payload"
        timestamp = str(int(time.time() * 1000))
        signature = generate_signature(payload, timestamp)

        is_valid = verify_webflow_signature(
            payload.encode('utf-8'),
            signature,
            timestamp,
            webhook_secret
        )

        assert is_valid is True

    def test_verify_invalid_signature(self):
        """Test signature verification with invalid signature"""
        payload = "test payload"
        timestamp = str(int(time.time() * 1000))

        is_valid = verify_webflow_signature(
            payload.encode('utf-8'),
            "invalid_signature",
            timestamp,
            webhook_secret
        )

        assert is_valid is False

    def test_verify_expired_timestamp(self):
        """Test signature verification with expired timestamp"""
        payload = "test payload"
        old_timestamp = str(int(time.time() * 1000) - 400000)
        signature = generate_signature(payload, old_timestamp)

        is_valid = verify_webflow_signature(
            payload.encode('utf-8'),
            signature,
            old_timestamp,
            webhook_secret
        )

        assert is_valid is False

    def test_verify_invalid_timestamp_format(self):
        """Test signature verification with invalid timestamp format"""
        payload = "test payload"
        invalid_timestamp = "not-a-number"
        signature = generate_signature(payload, invalid_timestamp)

        is_valid = verify_webflow_signature(
            payload.encode('utf-8'),
            signature,
            invalid_timestamp,
            webhook_secret
        )

        assert is_valid is False


@pytest.mark.parametrize("webhook_secret_env", ["", None])
def test_missing_webhook_secret(webhook_secret_env, monkeypatch):
    """Test webhook handler when WEBFLOW_WEBHOOK_SECRET is not set"""
    if webhook_secret_env is None:
        monkeypatch.delenv("WEBFLOW_WEBHOOK_SECRET", raising=False)
    else:
        monkeypatch.setenv("WEBFLOW_WEBHOOK_SECRET", webhook_secret_env)

    # Reload the app to pick up the environment change
    from importlib import reload
    import main
    reload(main)

    test_client = TestClient(main.app)

    payload = {"triggerType": "test", "payload": {}}
    timestamp = str(int(time.time() * 1000))
    # Generate signature with the test secret (not the empty one)
    signature = generate_signature(json.dumps(payload), timestamp, "test_secret")

    response = test_client.post(
        "/webhooks/webflow",
        headers={
            "x-webflow-signature": signature,
            "x-webflow-timestamp": timestamp,
            "content-type": "application/json"
        },
        json=payload
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Webhook secret not configured"