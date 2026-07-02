import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["JIRA_WEBHOOK_SECRET"] = "test_jira_secret"

from main import app, verify_jira_webhook

client = TestClient(app)


def generate_jira_signature(payload: str, secret: str) -> str:
    """Generate a valid Jira signature for testing.

    Mirrors Jira Cloud: HMAC-SHA256 over the raw body, hex, `sha256=` prefix.
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyJiraWebhook:
    """Tests for the Jira signature verification function."""

    secret = os.environ["JIRA_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"webhookEvent":"jira:issue_created"}'
        signature = generate_jira_signature(payload.decode(), self.secret)

        assert verify_jira_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"webhookEvent":"jira:issue_created"}'

        assert verify_jira_webhook(payload, "sha256=invalid", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"webhookEvent":"jira:issue_created"}'

        assert verify_jira_webhook(payload, None, self.secret) is False

    def test_missing_method_prefix_returns_false(self):
        payload = b'{"webhookEvent":"jira:issue_created"}'
        bare_hex = hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_jira_webhook(payload, bare_hex, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"webhookEvent":"jira:issue_created","key":"PROJ-1"}'
        signature = generate_jira_signature(original.decode(), self.secret)
        tampered = b'{"webhookEvent":"jira:issue_created","key":"PROJ-999"}'

        assert verify_jira_webhook(tampered, signature, self.secret) is False


class TestJiraWebhook:
    """Tests for the Jira webhook endpoint."""

    secret = os.environ["JIRA_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/jira",
            content='{"webhookEvent":"jira:issue_created"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"webhookEvent": "jira:issue_created"})

        response = client.post(
            "/webhooks/jira",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": "sha256=invalid",
            },
        )
        assert response.status_code == 401

    def test_valid_issue_created_returns_200(self):
        payload = json.dumps({
            "webhookEvent": "jira:issue_created",
            "issue": {"key": "PROJ-123", "fields": {"summary": "Test issue"}},
        })
        signature = generate_jira_signature(payload, self.secret)

        response = client.post(
            "/webhooks/jira",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
                "X-Atlassian-Webhook-Identifier": "test-delivery-id",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_issue_updated_event(self):
        payload = json.dumps({
            "webhookEvent": "jira:issue_updated",
            "issue": {"key": "PROJ-123", "fields": {"summary": "Test issue"}},
            "changelog": {"items": [{"field": "status", "toString": "In Progress"}]},
        })
        signature = generate_jira_signature(payload, self.secret)

        response = client.post(
            "/webhooks/jira",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_comment_created_event(self):
        payload = json.dumps({
            "webhookEvent": "comment_created",
            "issue": {"key": "PROJ-123", "fields": {"summary": "Test issue"}},
            "comment": {"body": "Nice work", "author": {"displayName": "Jane Developer"}},
        })
        signature = generate_jira_signature(payload, self.secret)

        response = client.post(
            "/webhooks/jira",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
