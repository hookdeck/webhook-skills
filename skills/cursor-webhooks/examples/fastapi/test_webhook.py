import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variable
os.environ['CURSOR_WEBHOOK_SECRET'] = 'test_secret_key'

from main import app

client = TestClient(app)


def generate_signature(payload: bytes, secret: str) -> str:
    """Generate valid Cursor webhook signature."""
    signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"


class TestCursorWebhook:
    """Test Cursor webhook handler."""

    def setup_method(self):
        """Set up test data."""
        self.valid_payload = {
            "event": "statusChange",
            "timestamp": "2024-01-01T12:00:00.000Z",
            "id": "agent_123456",
            "status": "FINISHED",
            "source": {
                "repository": "https://github.com/test/repo",
                "ref": "main"
            },
            "target": {
                "url": "https://github.com/test/repo/pull/123",
                "branchName": "feature-branch",
                "prUrl": "https://github.com/test/repo/pull/123"
            },
            "summary": "Updated 3 files and fixed linting errors"
        }

    def test_valid_webhook(self):
        """Test accepting valid webhook with correct signature."""
        payload = json.dumps(self.valid_payload).encode()
        signature = generate_signature(payload, os.environ['CURSOR_WEBHOOK_SECRET'])

        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange",
                "User-Agent": "Cursor-Agent-Webhook/1.0"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_signature(self):
        """Test rejecting webhook with invalid signature."""
        payload = json.dumps(self.valid_payload).encode()

        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": "sha256=invalid_signature",
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid signature"}

    def test_missing_signature(self):
        """Test rejecting webhook with missing signature."""
        payload = json.dumps(self.valid_payload).encode()

        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid signature"}

    def test_wrong_signature_format(self):
        """Test rejecting webhook with wrong signature format."""
        payload = json.dumps(self.valid_payload).encode()

        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": "invalid_format_signature",
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid signature"}

    def test_error_status(self):
        """Test handling ERROR status."""
        error_payload = self.valid_payload.copy()
        error_payload["status"] = "ERROR"
        payload = json.dumps(error_payload).encode()
        signature = generate_signature(payload, os.environ['CURSOR_WEBHOOK_SECRET'])

        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_json(self):
        """Test rejecting invalid JSON payload."""
        invalid_json = b'{"invalid": json}'
        signature = generate_signature(invalid_json, os.environ['CURSOR_WEBHOOK_SECRET'])

        response = client.post(
            "/webhooks/cursor",
            content=invalid_json,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid payload"}

    def test_health_check(self):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_missing_env_variable(self):
        """Test handling missing environment variable."""
        # Temporarily remove the secret
        original_secret = os.environ.get('CURSOR_WEBHOOK_SECRET')
        del os.environ['CURSOR_WEBHOOK_SECRET']

        payload = json.dumps(self.valid_payload).encode()
        response = client.post(
            "/webhooks/cursor",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": "sha256=any",
                "X-Webhook-ID": "msg_123456",
                "X-Webhook-Event": "statusChange"
            }
        )

        assert response.status_code == 500
        assert response.json() == {"detail": "Server configuration error"}

        # Restore the secret
        if original_secret:
            os.environ['CURSOR_WEBHOOK_SECRET'] = original_secret