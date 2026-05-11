import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["LINEAR_WEBHOOK_SECRET"] = "test_linear_secret"

from main import app, is_fresh_timestamp, verify_linear_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["LINEAR_WEBHOOK_SECRET"]


def generate_linear_signature(payload: str | bytes, secret: str) -> str:
    """Generate a valid Linear-Signature header value for testing.

    Matches Linear's algorithm: hex-encoded HMAC-SHA256 of the raw body,
    no `sha256=` prefix.
    """
    body = payload.encode("utf-8") if isinstance(payload, str) else payload
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def fresh_timestamp() -> int:
    return int(time.time() * 1000)


def build_payload(**overrides) -> str:
    payload = {
        "action": "create",
        "type": "Issue",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "data": {"id": "issue-1", "title": "Test issue"},
        "webhookId": "webhook-uuid",
        "webhookTimestamp": fresh_timestamp(),
        "organizationId": "org-uuid",
    }
    payload.update(overrides)
    return json.dumps(payload)


class TestVerifyLinearWebhook:
    def test_valid_signature_returns_true(self):
        payload = b'{"action":"create","type":"Issue"}'
        signature = generate_linear_signature(payload, SECRET)

        assert verify_linear_webhook(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"action":"create"}'

        assert verify_linear_webhook(payload, "a" * 64, SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"action":"create"}'

        assert verify_linear_webhook(payload, None, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"action":"create"}'
        signature = generate_linear_signature(payload, SECRET)

        assert verify_linear_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_body_returns_false(self):
        original = b'{"action":"create","id":1}'
        signature = generate_linear_signature(original, SECRET)
        tampered = b'{"action":"create","id":2}'

        assert verify_linear_webhook(tampered, signature, SECRET) is False


class TestIsFreshTimestamp:
    def test_accepts_fresh_timestamp(self):
        assert is_fresh_timestamp(fresh_timestamp()) is True
        assert is_fresh_timestamp(fresh_timestamp() - 30_000) is True

    def test_rejects_old_timestamp(self):
        assert is_fresh_timestamp(fresh_timestamp() - 5 * 60_000) is False

    def test_rejects_future_timestamp(self):
        assert is_fresh_timestamp(fresh_timestamp() + 5 * 60_000) is False

    def test_rejects_non_integer(self):
        assert is_fresh_timestamp(None) is False
        assert is_fresh_timestamp("123") is False
        assert is_fresh_timestamp(True) is False


class TestLinearWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/linear",
            content=build_payload(),
            headers={
                "Content-Type": "application/json",
                "Linear-Event": "Issue",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        body = build_payload()

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": "a" * 64,
                "Linear-Event": "Issue",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = build_payload()
        signature = generate_linear_signature(body, SECRET)

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": signature,
                "Linear-Event": "Issue",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_stale_timestamp_returns_400(self):
        body = build_payload(webhookTimestamp=fresh_timestamp() - 10 * 60_000)
        signature = generate_linear_signature(body, SECRET)

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": signature,
                "Linear-Event": "Issue",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Stale webhook"

    def test_handles_comment_event(self):
        body = build_payload(
            type="Comment",
            data={"id": "comment-1", "issueId": "issue-1", "body": "Looks good!"},
        )
        signature = generate_linear_signature(body, SECRET)

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": signature,
                "Linear-Event": "Comment",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 200

    def test_handles_project_event(self):
        body = build_payload(
            type="Project",
            data={"id": "project-1", "name": "New project"},
        )
        signature = generate_linear_signature(body, SECRET)

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": signature,
                "Linear-Event": "Project",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 200

    def test_handles_issue_sla_event(self):
        body = json.dumps(
            {
                "action": "highRisk",
                "type": "IssueSLA",
                "issueData": {"id": "issue-1"},
                "webhookTimestamp": fresh_timestamp(),
            }
        )
        signature = generate_linear_signature(body, SECRET)

        response = client.post(
            "/webhooks/linear",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Linear-Signature": signature,
                "Linear-Event": "IssueSLA",
                "Linear-Delivery": "delivery-uuid",
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
