import json
import os

import pytest
from fastapi.testclient import TestClient

# A random shared secret, the kind `openssl rand -hex 32` produces.
TEST_SECRET = "5f2b8c1e9a7d4e3f6b0c8a2d1e9f7b3c5a4d6e8f0b1c3a5d7e9f2b4c6a8d0e1f"
AUTH = f"Bearer {TEST_SECRET}"
os.environ["GORGIAS_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, event_name, parse_gorgias_body, verify_gorgias_authorization  # noqa: E402

client = TestClient(app)

ALL_TRIGGERS = [
    "ticket-created",
    "ticket-updated",
    "ticket-message-created",
    "ticket-self-unsnoozed",
    "ticket-message-failed",
    "ticket-assignment-updated",
    "ticket-status-updated",
    "ticket-handed-over",
]


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("GORGIAS_WEBHOOK_SECRET", TEST_SECRET)


def sample_payload(event: str = "ticket-created") -> dict:
    """What Gorgias sends for the recommended body template (variables rendered as strings)."""
    return {
        "event": event,
        "ticket_id": "48213",
        "subject": "Where is my order?",
        "status": "open",
        "channel": "email",
        "customer_email": "jane@example.com",
        "assignee_email": "",
        "updated_datetime": "2026-10-21T09:14:02.118000+00:00",
        "message_text": "Hi, my order #1042 hasn't arrived yet.",
    }


def send(payload=None, method="POST", auth=AUTH, content=None, content_type="application/json", url="/webhooks/gorgias"):
    headers = {}
    if auth is not None:
        headers["Authorization"] = auth
    if content is None and payload is not None:
        content = json.dumps(payload)
    if content is not None:
        headers["Content-Type"] = content_type
    return client.request(method, url, content=content, headers=headers)


class TestVerifyGorgiasAuthorization:
    def test_accepts_exact_value(self):
        assert verify_gorgias_authorization(AUTH, TEST_SECRET) is True

    def test_rejects_wrong_secret(self):
        assert verify_gorgias_authorization("Bearer wrong", TEST_SECRET) is False

    def test_rejects_bare_secret_without_scheme(self):
        assert verify_gorgias_authorization(TEST_SECRET, TEST_SECRET) is False

    def test_rejects_different_length(self):
        assert verify_gorgias_authorization(AUTH + "x", TEST_SECRET) is False

    def test_fails_closed(self):
        assert verify_gorgias_authorization(None, TEST_SECRET) is False
        assert verify_gorgias_authorization(AUTH, "") is False


class TestParsing:
    def test_parses_json(self):
        assert parse_gorgias_body(json.dumps(sample_payload()).encode(), "application/json")["ticket_id"] == "48213"

    def test_parses_form_urlencoded(self):
        body = b"event=ticket-updated&ticket_id=7&status=closed"
        assert parse_gorgias_body(body, "application/x-www-form-urlencoded") == {
            "event": "ticket-updated",
            "ticket_id": "7",
            "status": "closed",
        }

    def test_empty_body(self):
        assert parse_gorgias_body(b"", None) == {}

    def test_event_name_precedence(self):
        assert event_name({"event": "ticket-created"}, "ticket-updated") == "ticket-created"
        assert event_name({}, "ticket-updated") == "ticket-updated"
        assert event_name({}, None) == "unknown"


class TestWebhookEndpoint:
    def test_valid_request(self):
        response = send(sample_payload())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_authorization(self):
        response = send(sample_payload(), auth=None)
        assert response.status_code == 401
        assert response.json()["detail"] == "Missing Authorization header"

    def test_wrong_secret(self):
        response = send(sample_payload(), auth="Bearer not-the-secret")
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid Authorization header"

    def test_invalid_json(self):
        response = send(content='{"event": "ticket-created", "subject": "say "hi""}')
        assert response.status_code == 400

    def test_form_urlencoded(self):
        response = send(
            content="event=ticket-message-created&ticket_id=48213",
            content_type="application/x-www-form-urlencoded",
        )
        assert response.status_code == 200

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("GORGIAS_WEBHOOK_SECRET")
        response = send(sample_payload())
        assert response.status_code == 500

    @pytest.mark.parametrize("event", ALL_TRIGGERS + ["some-future-trigger"])
    def test_handles_each_trigger(self, event):
        assert send(sample_payload(event)).status_code == 200


class TestOtherMethods:
    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_accepts_method(self, method):
        assert send(sample_payload("ticket-updated"), method=method).status_code == 200

    def test_delete_without_body_uses_query_event(self):
        response = send(method="DELETE", url="/webhooks/gorgias?event=ticket-status-updated")
        assert response.status_code == 200

    def test_put_requires_auth(self):
        assert send(sample_payload(), method="PUT", auth=None).status_code == 401
