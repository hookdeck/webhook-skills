import pytest
import hmac
import hashlib
import base64
import time
import json
from fastapi.testclient import TestClient
from main import app

# Test webhook secret - using realistic format
TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5'  # 'whsec_' + base64('test_secret_key')


def generate_signature(payload: str, secret: str, webhook_id: str, timestamp: str) -> str:
    """Generate valid signature for testing."""
    key = base64.b64decode(secret.split('_')[1])
    signed_content = f"{webhook_id}.{timestamp}.{payload}"
    return base64.b64encode(
        hmac.new(key, signed_content.encode(), hashlib.sha256).digest()
    ).decode()


def create_test_prediction(status: str, overrides: dict = None) -> dict:
    """Create a test prediction payload."""
    base_data = {
        "id": "test_prediction_123",
        "version": "1.0.0",
        "status": status,
        "input": {"prompt": "test prompt"},
        "output": None,
        "logs": "",
        "error": None,
        "created_at": "2024-01-01T00:00:00.000Z",
        "started_at": "2024-01-01T00:00:01.000Z",
        "completed_at": None,
        "urls": {
            "get": "https://api.replicate.com/v1/predictions/test_prediction_123",
            "cancel": "https://api.replicate.com/v1/predictions/test_prediction_123/cancel"
        },
        "metrics": None
    }

    # Apply status-specific defaults
    if status == "processing":
        base_data["logs"] = "Processing image..."
    elif status == "succeeded":
        base_data["output"] = ["https://example.com/output.png"]
        base_data["completed_at"] = "2024-01-01T00:00:10.000Z"
        base_data["metrics"] = {"predict_time": 9.5}
    elif status == "failed":
        base_data["error"] = "Model error: Out of memory"
        base_data["completed_at"] = "2024-01-01T00:00:10.000Z"

    if overrides:
        base_data.update(overrides)

    return base_data


@pytest.fixture
def client():
    """Create test client."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    """Set test environment variables."""
    monkeypatch.setenv("REPLICATE_WEBHOOK_SECRET", TEST_SECRET)


class TestReplicateWebhook:
    """Test Replicate webhook handler."""

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"status": "Replicate webhook handler running"}

    def test_valid_webhook(self, client):
        """Test valid webhook with correct signature."""
        webhook_id = "msg_test123"
        timestamp = str(int(time.time()))
        prediction = create_test_prediction("succeeded")
        payload = json.dumps(prediction)
        signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": f"v1,{signature}"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["received"] is True
        assert data["predictionStatus"] == "succeeded"
        assert "processingTime" in data

    def test_multiple_signatures(self, client):
        """Test webhook with multiple signatures."""
        webhook_id = "msg_test456"
        timestamp = str(int(time.time()))
        prediction = create_test_prediction("starting")
        payload = json.dumps(prediction)
        valid_signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)
        invalid_signature = "invalid_signature"

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": f"v1,{invalid_signature} v1,{valid_signature}"
            }
        )

        assert response.status_code == 200
        assert response.json()["received"] is True

    def test_all_prediction_statuses(self, client):
        """Test all prediction statuses are handled."""
        statuses = ["starting", "processing", "succeeded", "failed", "canceled"]

        for status in statuses:
            webhook_id = f"msg_{status}_{int(time.time() * 1000)}"
            timestamp = str(int(time.time()))
            prediction = create_test_prediction(status)
            payload = json.dumps(prediction)
            signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)

            response = client.post(
                "/webhooks/replicate",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "webhook-id": webhook_id,
                    "webhook-timestamp": timestamp,
                    "webhook-signature": f"v1,{signature}"
                }
            )

            assert response.status_code == 200
            assert response.json()["predictionStatus"] == status

    def test_invalid_signature(self, client):
        """Test webhook with invalid signature."""
        webhook_id = "msg_invalid"
        timestamp = str(int(time.time()))
        prediction = create_test_prediction("succeeded")
        payload = json.dumps(prediction)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": "v1,invalid_signature"
            }
        )

        assert response.status_code == 400
        assert response.json() == {"error": "Invalid signature"}

    def test_missing_headers(self, client):
        """Test webhook missing required headers."""
        prediction = create_test_prediction("succeeded")
        payload = json.dumps(prediction)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={"Content-Type": "application/json"}
        )

        assert response.status_code == 400
        assert response.json() == {"error": "Missing required webhook headers"}

    def test_expired_timestamp(self, client):
        """Test webhook with expired timestamp."""
        webhook_id = "msg_expired"
        old_timestamp = str(int(time.time()) - 400)  # 400 seconds ago
        prediction = create_test_prediction("succeeded")
        payload = json.dumps(prediction)
        signature = generate_signature(payload, TEST_SECRET, webhook_id, old_timestamp)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": old_timestamp,
                "webhook-signature": f"v1,{signature}"
            }
        )

        assert response.status_code == 400
        assert response.json() == {"error": "Webhook timestamp too old"}

    def test_failed_prediction(self, client):
        """Test handling of failed prediction event."""
        webhook_id = "msg_failed"
        timestamp = str(int(time.time()))
        prediction = create_test_prediction("failed", {
            "error": "Model error: Out of memory",
            "output": None
        })
        payload = json.dumps(prediction)
        signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": f"v1,{signature}"
            }
        )

        assert response.status_code == 200
        assert response.json()["received"] is True

    def test_missing_webhook_secret(self, client, monkeypatch):
        """Test handling when webhook secret is not configured."""
        monkeypatch.delenv("REPLICATE_WEBHOOK_SECRET", raising=False)

        response = client.post(
            "/webhooks/replicate",
            content="{}",
            headers={
                "Content-Type": "application/json",
                "webhook-id": "test",
                "webhook-timestamp": "123",
                "webhook-signature": "test"
            }
        )

        assert response.status_code == 500
        assert response.json() == {"error": "Webhook secret not configured"}

    def test_invalid_json(self, client):
        """Test webhook with invalid JSON body."""
        webhook_id = "msg_invalid_json"
        timestamp = str(int(time.time()))
        payload = "invalid json"
        signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": f"v1,{signature}"
            }
        )

        assert response.status_code == 400
        assert response.json() == {"error": "Invalid JSON"}

    def test_unknown_prediction_status(self, client):
        """Test handling of unknown prediction status."""
        webhook_id = "msg_unknown"
        timestamp = str(int(time.time()))
        prediction = create_test_prediction("unknown_status")
        payload = json.dumps(prediction)
        signature = generate_signature(payload, TEST_SECRET, webhook_id, timestamp)

        response = client.post(
            "/webhooks/replicate",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": f"v1,{signature}"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["received"] is True
        assert data["predictionStatus"] == "unknown_status"