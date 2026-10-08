import base64
import pytest
from fastapi.testclient import TestClient
from main import app
import os

# Test client
client = TestClient(app)

# Test data
callback_username = "dg_user"
callback_password = "dg:pass-123"  # contains ':' on purpose
valid_api_key_id = "test_api_key_id_12345"


def basic_auth(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


valid_auth = basic_auth(callback_username, callback_password)

# Shape from Deepgram's pre-recorded /v1/listen response example:
# https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
valid_payload = {
    "metadata": {
        "request_id": "a847f427-4ad5-4d67-9b95-db801e58251c",
        "sha256": "154e291ecfa8be6ab8343560bcc109008fa7853eb5372533e8efdefc9b504c33",
        "created": "2024-05-12T18:57:13.426Z",
        "duration": 25.933313,
        "channels": 1,
        "models": ["30089e05-99d1-4376-b32e-c263170674af"],
        "model_info": {
            "30089e05-99d1-4376-b32e-c263170674af": {
                "name": "2-general-nova",
                "version": "2024-01-09.29447",
                "arch": "nova-2"
            }
        }
    },
    "results": {
        "channels": [
            {
                "alternatives": [
                    {
                        "transcript": "Yeah, as as much as, it's worth having a talk to the neighbors.",
                        "confidence": 0.9840088,
                        "words": [
                            {
                                "word": "yeah",
                                "start": 0.08,
                                "end": 0.32,
                                "confidence": 0.9975586
                            }
                        ]
                    }
                ]
            }
        ]
    }
}

@pytest.fixture(autouse=True)
def setup_env():
    """Set up test environment variables"""
    os.environ["DEEPGRAM_CALLBACK_USERNAME"] = callback_username
    os.environ["DEEPGRAM_CALLBACK_PASSWORD"] = callback_password
    os.environ["DEEPGRAM_API_KEY_ID"] = valid_api_key_id
    yield
    # Cleanup if needed

class TestDeepgramWebhook:
    def test_valid_basic_auth_without_dg_token(self):
        """Test accepting valid Basic Auth when dg-token is absent"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"Authorization": valid_auth}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["requestId"] == "a847f427-4ad5-4d67-9b95-db801e58251c"

    def test_valid_basic_auth_with_matching_dg_token(self):
        """Test accepting valid Basic Auth with a matching dg-token"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"Authorization": valid_auth, "dg-token": valid_api_key_id}
        )
        assert response.status_code == 200

    def test_missing_authorization(self):
        """Test rejecting webhook with no Authorization header"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"dg-token": valid_api_key_id}
        )
        assert response.status_code == 401
        assert "Invalid Basic Auth credentials" in response.json()["detail"]

    def test_wrong_password(self):
        """Test rejecting webhook with wrong Basic Auth password"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"Authorization": basic_auth(callback_username, "wrong")}
        )
        assert response.status_code == 401

    def test_invalid_dg_token(self):
        """Test rejecting webhook with a mismatched dg-token"""
        response = client.post(
            "/webhooks/deepgram",
            json=valid_payload,
            headers={"Authorization": valid_auth, "dg-token": "invalid_token"}
        )
        assert response.status_code == 403
        assert "Invalid dg-token" in response.json()["detail"]

    def test_minimal_payload(self):
        """Test handling webhook with minimal payload"""
        minimal_payload = {
            "metadata": {
                "request_id": "req_minimal",
                "created": "2024-01-20T10:30:00.000Z",
                "duration": 10.0,
                "channels": 1
            },
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
            headers={"Authorization": valid_auth}
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
            headers={"Authorization": valid_auth}
        )
        assert response.status_code == 200

    def test_invalid_json(self):
        """Test rejecting invalid JSON payload"""
        response = client.post(
            "/webhooks/deepgram",
            content="invalid json",
            headers={
                "Authorization": valid_auth,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 400  # Invalid webhook payload

    def test_multi_channel_transcription(self):
        """Test handling multi-channel transcription"""
        multi_channel_payload = {
            **valid_payload,
            "metadata": {**valid_payload["metadata"], "channels": 2},
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
            headers={"Authorization": valid_auth}
        )
        assert response.status_code == 200

    def test_extra_metadata(self):
        """Test handling webhook with extra metadata"""
        extra_payload = {
            **valid_payload,
            "metadata": {
                **valid_payload["metadata"],
                "extra": {
                    "user_id": "12345",
                    "session_id": "session-abc"
                }
            }
        }
        response = client.post(
            "/webhooks/deepgram",
            json=extra_payload,
            headers={"Authorization": valid_auth}
        )
        assert response.status_code == 200

    def test_missing_required_fields(self):
        """Test rejecting payload missing required fields"""
        invalid_payload = {
            "metadata": {"request_id": "req_123"}
            # Missing other required fields
        }
        response = client.post(
            "/webhooks/deepgram",
            json=invalid_payload,
            headers={"Authorization": valid_auth}
        )
        assert response.status_code == 400  # Invalid webhook payload

class TestHealthEndpoint:
    def test_health_check(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}
