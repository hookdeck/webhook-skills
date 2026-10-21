import base64
import json
import os

# Set test environment variables before importing the app
os.environ["N8N_WEBHOOK_SECRET"] = "test_n8n_shared_secret_0123456789"
os.environ["N8N_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["N8N_BASIC_AUTH_USER"] = "n8n"
os.environ["N8N_BASIC_AUTH_PASSWORD"] = "test_basic_password"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_n8n_request

client = TestClient(app)

SECRET = os.environ["N8N_WEBHOOK_SECRET"]


def sample_payload(event="order.created"):
    """What an n8n HTTP Request node would send with Body Content Type = JSON."""
    return {
        "event": event,
        "id": "exec_1042",
        "data": {"order_id": "ord_123", "email": "jane@example.com", "workflow_name": "Orders sync"},
    }


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def post(headers=None, body=None):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/n8n",
        content=content,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestHeaderAuth:
    def test_correct_secret_header(self):
        res = post({"X-Webhook-Secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-webhook-secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"X-Webhook-Secret": "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({"X-Webhook-Secret": "short"}).status_code == 401


class TestBearerAuth:
    def test_correct_bearer_token(self):
        assert post({"Authorization": f"Bearer {SECRET}"}).status_code == 200

    def test_wrong_bearer_token(self):
        assert post({"Authorization": "Bearer not-the-secret"}).status_code == 401


class TestBasicAuth:
    def test_correct_credentials(self):
        assert post({"Authorization": basic("n8n", "test_basic_password")}).status_code == 200

    def test_wrong_password(self):
        assert post({"Authorization": basic("n8n", "wrong")}).status_code == 401

    def test_wrong_username(self):
        assert post({"Authorization": basic("admin", "test_basic_password")}).status_code == 401

    def test_malformed_base64(self):
        assert post({"Authorization": "Basic !!!not-base64"}).status_code == 401


class TestRequestHandling:
    def test_missing_credentials(self):
        assert post().status_code == 401

    def test_invalid_json(self):
        assert post({"X-Webhook-Secret": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"X-Webhook-Secret": SECRET}, body="[1,2,3]").status_code == 400

    @pytest.mark.parametrize(
        "event",
        ["lead.created", "order.created", "workflow.completed", "workflow.failed", "something.else"],
    )
    def test_handles_events(self, event):
        res = post({"X-Webhook-Secret": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200


class TestVerifyN8nRequest:
    def test_rejects_when_nothing_configured(self):
        assert verify_n8n_request({"x-webhook-secret": ""}, {}) is False
        assert verify_n8n_request({"authorization": "Bearer "}, {}) is False
        assert verify_n8n_request({"authorization": basic("", "")}, {}) is False

    def test_custom_header_name(self):
        config = {"N8N_WEBHOOK_SECRET": "s3cret", "N8N_WEBHOOK_HEADER": "x-n8n-token"}
        assert verify_n8n_request({"x-n8n-token": "s3cret"}, config) is True
        assert verify_n8n_request({"x-webhook-secret": "s3cret"}, config) is False


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
