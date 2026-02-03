import os
import hmac
import hashlib
import base64
import json
import time
import pytest
from httpx import AsyncClient
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["OPENAI_API_KEY"] = "sk-test-fake-key"
# Base64 encoded test secret for Standard Webhooks
os.environ["OPENAI_WEBHOOK_SECRET"] = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n"

from main import app


def generate_standard_webhooks_signature(
    payload: bytes,
    secret: str,
    webhook_id: str,
    webhook_timestamp: str
) -> str:
    """
    Generate a valid Standard Webhooks signature for testing
    """
    # Remove whsec_ prefix and decode base64
    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    secret_bytes = base64.b64decode(secret_key)

    # Create signed content: id.timestamp.payload
    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    # Generate HMAC signature
    signature = base64.b64encode(
        hmac.new(
            secret_bytes,
            signed_content.encode('utf-8'),
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

    return f"v1,{signature}"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def webhook_secret():
    return os.environ["OPENAI_WEBHOOK_SECRET"]


class TestOpenAIWebhook:
    def test_missing_signature_headers(self, client):
        response = client.post(
            "/webhooks/openai",
            content="{}",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_signature_format(self, client):
        payload = json.dumps({
            "id": "evt_test_123",
            "type": "fine_tuning.job.succeeded",
            "data": {"id": "ftjob-ABC123"}
        })

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "invalid_format"
            }
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_expired_timestamp(self, client, webhook_secret):
        payload = json.dumps({
            "id": "evt_test_123",
            "type": "fine_tuning.job.succeeded",
            "data": {"id": "ftjob-ABC123"}
        })

        webhook_id = "msg_test123"
        old_timestamp = str(int(time.time()) - 400)  # 400 seconds ago
        signature = generate_standard_webhooks_signature(
            payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            old_timestamp
        )

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": old_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_signature(self, client):
        payload = json.dumps({
            "id": "evt_test_123",
            "type": "fine_tuning.job.succeeded",
            "data": {"id": "ftjob-ABC123"}
        })

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "v1,invalid_signature_value"
            }
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_tampered_payload(self, client, webhook_secret):
        original_payload = json.dumps({
            "id": "evt_test_123",
            "type": "fine_tuning.job.succeeded",
            "data": {"id": "ftjob-ABC123"}
        })

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))

        # Sign with original payload
        signature = generate_standard_webhooks_signature(
            original_payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            webhook_timestamp
        )

        # But send tampered payload
        tampered_payload = json.dumps({
            "id": "evt_test_123",
            "type": "fine_tuning.job.succeeded",
            "data": {"id": "ftjob-TAMPERED"}
        })

        response = client.post(
            "/webhooks/openai",
            content=tampered_payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_valid_signature(self, client, webhook_secret):
        payload = json.dumps({
            "id": "evt_test_valid",
            "type": "fine_tuning.job.succeeded",
            "created_at": 1234567890,
            "data": {
                "id": "ftjob-ABC123",
                "fine_tuned_model": "ft:gpt-4o-mini:my-org:custom:id"
            }
        })

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            webhook_timestamp
        )

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize("event_type", [
        "fine_tuning.job.succeeded",
        "fine_tuning.job.failed",
        "fine_tuning.job.cancelled",
        "batch.completed",
        "batch.failed",
        "batch.cancelled",
        "batch.expired",
        "realtime.call.incoming"
    ])
    def test_handle_event_types(self, client, webhook_secret, event_type):
        payload = json.dumps({
            "id": f"evt_test_{event_type}",
            "type": event_type,
            "created_at": time.time(),
            "data": {"id": "resource_123"}
        })

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            webhook_timestamp
        )

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unrecognized_event_type(self, client, webhook_secret):
        payload = json.dumps({
            "id": "evt_test_unknown",
            "type": "unknown.event.type",
            "created_at": time.time(),
            "data": {"test": True}
        })

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            webhook_timestamp
        )

        response = client.post(
            "/webhooks/openai",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_malformed_json_payload(self, client, webhook_secret):
        malformed_payload = "{invalid json"

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            malformed_payload.encode('utf-8'),
            webhook_secret,
            webhook_id,
            webhook_timestamp
        )

        response = client.post(
            "/webhooks/openai",
            content=malformed_payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature
            }
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    def test_no_webhook_secret_configured(self, client):
        # Temporarily remove the webhook secret
        original_secret = os.environ.get("OPENAI_WEBHOOK_SECRET")
        del os.environ["OPENAI_WEBHOOK_SECRET"]

        try:
            response = client.post(
                "/webhooks/openai",
                content="{}",
                headers={"Content-Type": "application/json"}
            )
            assert response.status_code == 500
            assert response.json()["detail"] == "Webhook secret not configured"
        finally:
            # Restore the secret
            if original_secret:
                os.environ["OPENAI_WEBHOOK_SECRET"] = original_secret


class TestHealthCheck:
    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}