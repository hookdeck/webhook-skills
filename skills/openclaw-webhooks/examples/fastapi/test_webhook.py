import os
import pytest
from fastapi.testclient import TestClient

os.environ["OPENCLAW_HOOK_TOKEN"] = "test-secret-token"

from main import app

client = TestClient(app)
VALID_TOKEN = "test-secret-token"


class TestAgentHook:
    def test_valid_bearer_token(self):
        res = client.post(
            "/webhooks/openclaw",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={"message": "Test message", "name": "Test"},
        )
        assert res.status_code == 200
        assert res.json()["received"] is True

    def test_valid_x_token(self):
        res = client.post(
            "/webhooks/openclaw",
            headers={"x-openclaw-token": VALID_TOKEN},
            json={"message": "Test message", "name": "Test"},
        )
        assert res.status_code == 200

    def test_invalid_token(self):
        res = client.post(
            "/webhooks/openclaw",
            headers={"Authorization": "Bearer wrong-token"},
            json={"message": "Test message"},
        )
        assert res.status_code == 401

    def test_missing_token(self):
        res = client.post(
            "/webhooks/openclaw",
            json={"message": "Test message"},
        )
        assert res.status_code == 401

    def test_query_string_token_rejected(self):
        res = client.post(
            "/webhooks/openclaw?token=test",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={"message": "Test message"},
        )
        assert res.status_code == 400

    def test_missing_message(self):
        res = client.post(
            "/webhooks/openclaw",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={"name": "Test"},
        )
        assert res.status_code == 400

    def test_full_payload(self):
        res = client.post(
            "/webhooks/openclaw",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={
                "message": "Summarize inbox",
                "name": "Email",
                "agentId": "hooks",
                "sessionKey": "hook:email:1",
                "wakeMode": "now",
                "deliver": True,
                "channel": "slack",
                "model": "openai/gpt-5.2-mini",
            },
        )
        assert res.status_code == 200
        assert res.json()["received"] is True


class TestWakeHook:
    def test_valid_wake(self):
        res = client.post(
            "/webhooks/openclaw/wake",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={"text": "Wake up!", "mode": "now"},
        )
        assert res.status_code == 200

    def test_missing_text(self):
        res = client.post(
            "/webhooks/openclaw/wake",
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
            json={"mode": "now"},
        )
        assert res.status_code == 400


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
