import os

# Set test environment variables before importing app
os.environ["AUTH0_LOG_STREAM_TOKEN"] = "test_log_stream_token"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

TOKEN = os.environ["AUTH0_LOG_STREAM_TOKEN"]


def sample_batch():
    return [
        {
            "log_id": "90020210714154213417000000000000000000000000000000",
            "data": {
                "date": "2021-07-14T15:42:13.410Z",
                "type": "s",
                "description": "Successful login",
                "client_id": "AbC123ClientId",
                "ip": "203.0.113.10",
                "user_id": "auth0|64f0000000000000000000001",
                "user_name": "user@example.com",
            },
        }
    ]


class TestAuth0Webhook:
    def test_missing_authorization_returns_401(self):
        response = client.post("/webhooks/auth0", json=sample_batch())
        assert response.status_code == 401
        assert "Missing Authorization" in response.json()["detail"]

    def test_invalid_token_returns_401(self):
        response = client.post(
            "/webhooks/auth0",
            json=sample_batch(),
            headers={"Authorization": "wrong_token"},
        )
        assert response.status_code == 401
        assert "Invalid Authorization" in response.json()["detail"]

    def test_valid_token_returns_200(self):
        response = client.post(
            "/webhooks/auth0",
            json=sample_batch(),
            headers={"Authorization": TOKEN},
        )
        assert response.status_code == 200
        assert response.json() == {"received": 1}

    def test_processes_batch_of_multiple_events(self):
        batch = [
            {"data": {"type": "s", "user_name": "a@example.com"}},
            {"data": {"type": "f", "ip": "203.0.113.10", "description": "wrong password"}},
            {"data": {"type": "ss", "user_name": "b@example.com"}},
            {"data": {"type": "fs", "description": "invalid email"}},
            {"data": {"type": "sepft", "user_name": "a@example.com"}},
            {"data": {"type": "unknown_code"}},
        ]
        response = client.post(
            "/webhooks/auth0",
            json=batch,
            headers={"Authorization": TOKEN},
        )
        assert response.status_code == 200
        assert response.json() == {"received": 6}

    def test_different_length_token_is_rejected(self):
        response = client.post(
            "/webhooks/auth0",
            json=sample_batch(),
            headers={"Authorization": "short"},
        )
        assert response.status_code == 401


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
