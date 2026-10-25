import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["COMPANYCAM_WEBHOOK_TOKEN"] = "test_webhook_token"

from main import app

client = TestClient(app)

TOKEN = os.environ["COMPANYCAM_WEBHOOK_TOKEN"]


def generate_signature(payload: str, token: str) -> str:
    """Generate a valid CompanyCam signature: Base64(HMAC-SHA1(token, raw body))."""
    digest = hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("utf-8")


def event(event_type: str, payload=None) -> str:
    return json.dumps(
        {
            "event_type": event_type,
            "created_at": 1661361759,
            "payload": payload if payload is not None else {"id": "123"},
            "webhook_id": 42,
        }
    )


class TestCompanyCamWebhook:
    """Tests for the CompanyCam webhook endpoint."""

    def test_missing_signature_returns_401(self):
        response = client.post("/webhooks/companycam", content=event("photo.created"))
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/companycam",
            content=event("photo.created"),
            headers={"X-CompanyCam-Signature": "invalid"},
        )
        assert response.status_code == 401

    def test_wrong_token_returns_401(self):
        body = event("photo.created")
        response = client.post(
            "/webhooks/companycam",
            content=body,
            headers={"X-CompanyCam-Signature": generate_signature(body, "other_token")},
        )
        assert response.status_code == 401

    def test_non_ascii_signature_returns_401(self):
        response = client.post(
            "/webhooks/companycam",
            content=event("photo.created"),
            headers={"X-CompanyCam-Signature": "sigñ".encode("utf-8")},  # raw non-ASCII bytes
        )
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        signature = generate_signature(event("photo.created"), TOKEN)
        response = client.post(
            "/webhooks/companycam",
            content=event("photo.created", {"id": "999"}),
            headers={"X-CompanyCam-Signature": signature},
        )
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "event_type",
        [
            "project.created",
            "project.updated",
            "photo.created",
            "photo.updated",
            "comment.created",
            "document.created",
            "todo_list.completed",
            "task.completed",
        ],
    )
    def test_valid_events_return_200(self, event_type):
        body = event(event_type)
        response = client.post(
            "/webhooks/companycam",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-CompanyCam-Signature": generate_signature(body, TOKEN),
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = event("photo.created")
        response = client.post(
            "/webhooks/companycam",
            content=body,
            headers={
                "Content-Type": "text/plain",
                "X-CompanyCam-Signature": generate_signature(body, TOKEN),
            },
        )
        assert response.status_code == 200

    def test_unknown_event_returns_200(self):
        body = event("video.created")
        response = client.post(
            "/webhooks/companycam",
            content=body,
            headers={"X-CompanyCam-Signature": generate_signature(body, TOKEN)},
        )
        assert response.status_code == 200

    def test_invalid_json_with_valid_signature_returns_400(self):
        body = "not json"
        response = client.post(
            "/webhooks/companycam",
            content=body,
            headers={"X-CompanyCam-Signature": generate_signature(body, TOKEN)},
        )
        assert response.status_code == 400

    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
