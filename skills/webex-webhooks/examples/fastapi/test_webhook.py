import os
import json
import hmac
import hashlib
from typing import Optional

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["WEBEX_WEBHOOK_SECRET"] = "test_webex_webhook_secret"

from main import app, verify_webex_webhook

client = TestClient(app)

SECRET = os.environ["WEBEX_WEBHOOK_SECRET"]


def generate_webex_signature(payload: str, secret: str) -> str:
    """Generate a valid Webex signature for testing.

    Matches Webex: X-Spark-Signature = hex HMAC-SHA1(rawBody, secret)
    """
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).hexdigest()


def webex_body(resource: str, event: str, data: Optional[dict] = None) -> str:
    return json.dumps(
        {
            "id": "Y2lzY29zcGFyazovL3VzL1dFQkhPT0svZjRlNjA1NjA",
            "name": "Test webhook",
            "resource": resource,
            "event": event,
            "status": "active",
            "data": data or {},
        }
    )


def post(payload: str, signature: Optional[str] = None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Spark-Signature"] = signature
    return client.post("/webhooks/webex", content=payload, headers=headers)


class TestVerifyWebexWebhook:
    """Tests for the Webex signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = webex_body("messages", "created")
        signature = generate_webex_signature(payload, SECRET)

        assert verify_webex_webhook(payload.encode(), signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = webex_body("messages", "created")

        assert verify_webex_webhook(payload.encode(), "invalid", SECRET) is False

    def test_tampered_body_returns_false(self):
        signature = generate_webex_signature(webex_body("messages", "created"), SECRET)

        assert (
            verify_webex_webhook(webex_body("messages", "deleted").encode(), signature, SECRET)
            is False
        )

    def test_wrong_secret_returns_false(self):
        payload = webex_body("messages", "created")
        signature = generate_webex_signature(payload, SECRET)

        assert verify_webex_webhook(payload.encode(), signature, "wrong_secret") is False

    def test_missing_signature_returns_false(self):
        payload = webex_body("messages", "created")

        assert verify_webex_webhook(payload.encode(), None, SECRET) is False


class TestWebexWebhookEndpoint:
    """Tests for POST /webhooks/webex."""

    def test_missing_signature_returns_400(self):
        response = post(webex_body("messages", "created"))

        assert response.status_code == 400
        assert response.json() == {"error": "Invalid signature"}

    def test_invalid_signature_returns_400(self):
        response = post(webex_body("messages", "created"), "invalid")

        assert response.status_code == 400

    def test_valid_messages_created_returns_200(self):
        payload = webex_body(
            "messages",
            "created",
            {"id": "msg_1", "roomId": "room_1", "personEmail": "matt@example.com"},
        )

        response = post(payload, generate_webex_signature(payload, SECRET))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "resource,event",
        [
            ("messages", "deleted"),
            ("memberships", "created"),
            ("memberships", "deleted"),
            ("rooms", "created"),
            ("rooms", "updated"),
            ("meetings", "started"),
            ("meetings", "ended"),
            ("attachmentActions", "created"),
        ],
    )
    def test_handles_event(self, resource, event):
        payload = webex_body(resource, event, {"id": "obj_1"})

        response = post(payload, generate_webex_signature(payload, SECRET))

        assert response.status_code == 200

    def test_acknowledges_unhandled_event(self):
        payload = webex_body("recordings", "created", {"id": "rec_1"})

        response = post(payload, generate_webex_signature(payload, SECRET))

        assert response.status_code == 200

    def test_signed_non_json_body_returns_400(self):
        payload = "not json"

        response = post(payload, generate_webex_signature(payload, SECRET))

        assert response.status_code == 400
        assert response.json() == {"error": "Invalid JSON"}


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
