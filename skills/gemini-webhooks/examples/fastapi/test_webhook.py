import os
import hmac
import hashlib
import base64
import json
import time

import pytest
from fastapi.testclient import TestClient

# Set test env vars before importing app.
os.environ["GEMINI_API_KEY"] = "test-gemini-key"
# Base64 of "test_secret_key_for_testing"
os.environ["GEMINI_WEBHOOK_SECRET"] = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n"

from main import app  # noqa: E402


def generate_standard_webhooks_signature(
    payload: bytes,
    secret: str,
    webhook_id: str,
    webhook_timestamp: str,
) -> str:
    secret_key = secret[6:] if secret.startswith("whsec_") else secret
    secret_bytes = base64.b64decode(secret_key)

    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    return f"v1,{signature}"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def webhook_secret():
    return os.environ["GEMINI_WEBHOOK_SECRET"]


class TestGeminiWebhook:
    def test_missing_signature_headers(self, client):
        response = client.post(
            "/webhooks/gemini",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_signature_format(self, client):
        payload = json.dumps({"type": "batch.succeeded", "data": {"id": "batch_123"}})

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "invalid_format",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_expired_timestamp(self, client, webhook_secret):
        payload = json.dumps({"type": "batch.succeeded", "data": {"id": "batch_123"}})

        webhook_id = "msg_test123"
        old_timestamp = str(int(time.time()) - 400)  # 6m40s ago
        signature = generate_standard_webhooks_signature(
            payload.encode("utf-8"), webhook_secret, webhook_id, old_timestamp
        )

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": old_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_signature(self, client):
        payload = json.dumps({"type": "batch.succeeded", "data": {"id": "batch_123"}})

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "v1,invalid_signature_value",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_tampered_payload(self, client, webhook_secret):
        original_payload = json.dumps({"type": "batch.succeeded", "data": {"id": "batch_123"}})

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))

        signature = generate_standard_webhooks_signature(
            original_payload.encode("utf-8"), webhook_secret, webhook_id, webhook_timestamp
        )

        tampered_payload = json.dumps({"type": "batch.succeeded", "data": {"id": "batch_TAMPERED"}})

        response = client.post(
            "/webhooks/gemini",
            content=tampered_payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_valid_signature(self, client, webhook_secret):
        payload = json.dumps({
            "type": "batch.succeeded",
            "version": "v1",
            "timestamp": "2026-05-04T12:00:00Z",
            "data": {
                "id": "batch_ABC123",
                "output_file_uri": "gs://example-bucket/out.jsonl",
            },
        })

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode("utf-8"), webhook_secret, webhook_id, webhook_timestamp
        )

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        [
            "batch.succeeded",
            "batch.failed",
            "batch.cancelled",
            "batch.expired",
            "video.generated",
            "interaction.completed",
            "interaction.requires_action",
            "interaction.failed",
            "interaction.cancelled",
        ],
    )
    def test_handle_event_types(self, client, webhook_secret, event_type):
        payload = json.dumps({
            "type": event_type,
            "version": "v1",
            "timestamp": "2026-05-04T12:00:00Z",
            "data": {"id": "resource_123"},
        })

        webhook_id = f"msg_{event_type}"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode("utf-8"), webhook_secret, webhook_id, webhook_timestamp
        )

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unrecognized_event_type(self, client, webhook_secret):
        payload = json.dumps({"type": "unknown.event.type", "data": {"test": True}})

        webhook_id = "msg_unknown"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            payload.encode("utf-8"), webhook_secret, webhook_id, webhook_timestamp
        )

        response = client.post(
            "/webhooks/gemini",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_malformed_json_payload(self, client, webhook_secret):
        malformed_payload = "{invalid json"

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_standard_webhooks_signature(
            malformed_payload.encode("utf-8"), webhook_secret, webhook_id, webhook_timestamp
        )

        response = client.post(
            "/webhooks/gemini",
            content=malformed_payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    def test_no_webhook_secret_configured(self, client):
        original_secret = os.environ.get("GEMINI_WEBHOOK_SECRET")
        del os.environ["GEMINI_WEBHOOK_SECRET"]
        try:
            response = client.post(
                "/webhooks/gemini",
                content="{}",
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 500
            assert response.json()["detail"] == "Webhook secret not configured"
        finally:
            if original_secret:
                os.environ["GEMINI_WEBHOOK_SECRET"] = original_secret


class TestHealthCheck:
    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
