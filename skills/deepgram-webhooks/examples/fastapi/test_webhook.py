import pytest
from fastapi.testclient import TestClient
from main import app
import os

# Test client
client = TestClient(app)

# Test data
valid_api_key_id = "test_api_key_id_12345"
valid_payload = {
    "request_id": "req_123456789",
    "created": "2024-01-20T10:30:00.000Z",
    "duration": 30.5,
    "channels": 1,
    "model_info": {
        "name": "general",
        "version": "2024-01-09.29447",
        "arch": "nova-2"
    },
    "results": {
        "channels": [
            {
                "alternatives": [
                    {
                        "transcript": "This is a test transcription from Deepgram.",
                        "confidence": 0.98765,
                        "words": [
                            {
                                "word": "This",
                                "start": 0.0,
                                "end": 0.24,
                                "confidence": 0.99
                            }
                        ]
                    }
                ]
            }
        ]
    },
    "metadata": {
        "transaction_key": "test_transaction",
        "request_time": 1.234,
        "created_time": "2024-01-20T10:30:00.000Z"
    }
}

@pytest.fixture(autouse=True)
def setup_env():
    """Set up test environment variables"""
    os.environ["DEEPGRAM_API_KEY_ID"] = valid_api_key_id
    yield
    # Cleanup if needed

class TestDeepgramWebhook:
    def test_valid_webhook(self):
        """Test accepting valid webhook with correct dg-token"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["requestId"] == "req_123456789"

    def test_missing_dg_token(self):
        """Test rejecting webhook with missing dg-token"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload
        )
        assert response.status_code == 401
        assert "Missing dg-token header" in response.json()["detail"]

    def test_invalid_dg_token(self):
        """Test rejecting webhook with invalid dg-token"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"dg-token": "invalid_token"}
        )
        assert response.status_code == 403
        assert "Invalid dg-token" in response.json()["detail"]

    def test_minimal_payload(self):
        """Test handling webhook with minimal payload"""
        minimal_payload = {
            "request_id": "req_minimal",
            "created": "2024-01-20T10:30:00.000Z",
            "duration": 10.0,
            "channels": 1,
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "Short test.",
                                "confidence": 0.95
                            }
                        ]
                    }
                ]
            }
        }
        response = client.post(
            "/webhooks/deepgram",
            json=minimal_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["requestId"] == "req_minimal"

    def test_empty_transcript(self):
        """Test handling webhook with empty transcript"""
        empty_transcript_payload = {
            **valid_payload,
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "",
                                "confidence": 0.0
                            }
                        ]
                    }
                ]
            }
        }
        response = client.post(
            "/webhooks/deepgram",
            json=empty_transcript_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 200

    def test_invalid_json(self):
        """Test rejecting invalid JSON payload"""
        response = client.post(
            "/webhooks/deepgram",
            data="invalid json",
            headers={
                "dg-token": valid_api_key_id,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 400  # Invalid webhook payload

    def test_multi_channel_transcription(self):
        """Test handling multi-channel transcription"""
        multi_channel_payload = {
            **valid_payload,
            "channels": 2,
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "Channel 1 transcription.",
                                "confidence": 0.98
                            }
                        ]
                    },
                    {
                        "alternatives": [
                            {
                                "transcript": "Channel 2 transcription.",
                                "confidence": 0.97
                            }
                        ]
                    }
                ]
            }
        }
        response = client.post(
            "/webhooks/deepgram",
            json=multi_channel_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 200

    def test_custom_metadata(self):
        """Test handling webhook with custom metadata"""
        metadata_payload = {
            **valid_payload,
            "metadata": {
                "user_id": "12345",
                "session_id": "session-abc",
                "custom_field": "custom_value"
            }
        }
        response = client.post(
            "/webhooks/deepgram",
            json=metadata_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 200

    def test_missing_required_fields(self):
        """Test rejecting payload missing required fields"""
        invalid_payload = {
            "request_id": "req_123"
            # Missing other required fields
        }
        response = client.post(
            "/webhooks/deepgram",
            json=invalid_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 400  # Invalid webhook payload

class TestHealthEndpoint:
    def test_health_check(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}