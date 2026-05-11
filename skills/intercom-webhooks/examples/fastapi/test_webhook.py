import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["INTERCOM_CLIENT_SECRET"] = "test_intercom_client_secret"

import main  # noqa: E402
from main import app, verify_intercom_webhook  # noqa: E402

# Make sure the imported module sees the test secret (it reads it at import time)
main.intercom_client_secret = os.environ["INTERCOM_CLIENT_SECRET"]

client = TestClient(app)


def generate_intercom_signature(payload: str, secret: str) -> str:
    """Generate a valid Intercom signature (sha1=<hex>) for testing."""
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha1,
    ).hexdigest()
    return f"sha1={signature}"


class TestVerifyIntercomWebhook:
    """Tests for the Intercom signature verification helper."""

    secret = os.environ["INTERCOM_CLIENT_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"topic":"ping","id":"notif_1"}'
        signature = generate_intercom_signature(payload.decode(), self.secret)

        assert verify_intercom_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"topic":"ping"}'

        assert verify_intercom_webhook(payload, "sha1=deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"topic":"ping"}'

        assert verify_intercom_webhook(payload, None, self.secret) is False

    def test_missing_secret_returns_false(self):
        payload = b'{"topic":"ping"}'
        signature = generate_intercom_signature(payload.decode(), self.secret)

        assert verify_intercom_webhook(payload, signature, "") is False

    def test_wrong_algorithm_returns_false(self):
        payload = b'{"topic":"ping"}'
        sha256 = hmac.new(
            self.secret.encode(), payload, hashlib.sha256
        ).hexdigest()

        assert verify_intercom_webhook(payload, f"sha256={sha256}", self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"topic":"ping","id":"a"}'
        tampered = b'{"topic":"ping","id":"b"}'
        signature = generate_intercom_signature(original.decode(), self.secret)

        assert verify_intercom_webhook(tampered, signature, self.secret) is False

    def test_malformed_signature_returns_false(self):
        payload = b'{"topic":"ping"}'

        assert verify_intercom_webhook(payload, "not_a_valid_format", self.secret) is False


class TestIntercomWebhook:
    """Tests for the Intercom webhook endpoint."""

    secret = os.environ["INTERCOM_CLIENT_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/intercom",
            content='{"topic":"ping"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"topic": "ping", "id": "notif_x"})

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": "sha1=deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_ping_returns_200(self):
        payload = json.dumps(
            {
                "type": "notification_event",
                "topic": "ping",
                "id": "notif_ping_1",
                "data": {"type": "notification_event_data", "item": {}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_conversation_user_created(self):
        payload = json.dumps(
            {
                "topic": "conversation.user.created",
                "id": "notif_conv_1",
                "data": {"item": {"type": "conversation", "id": "conv_123"}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_conversation_admin_replied(self):
        payload = json.dumps(
            {
                "topic": "conversation.admin.replied",
                "id": "notif_reply_1",
                "data": {"item": {"type": "conversation", "id": "conv_456"}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_contact_user_created(self):
        payload = json.dumps(
            {
                "topic": "contact.user.created",
                "id": "notif_contact_1",
                "data": {"item": {"type": "contact", "id": "contact_789"}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_ticket_created(self):
        payload = json.dumps(
            {
                "topic": "ticket.created",
                "id": "notif_ticket_1",
                "data": {"item": {"type": "ticket", "id": "ticket_42"}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_unknown_topic_still_returns_200(self):
        payload = json.dumps(
            {
                "topic": "some.future.topic",
                "id": "notif_unknown_1",
                "data": {"item": {}},
            }
        )
        signature = generate_intercom_signature(payload, self.secret)

        response = client.post(
            "/webhooks/intercom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
