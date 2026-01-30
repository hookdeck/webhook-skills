import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["GITHUB_WEBHOOK_SECRET"] = "test_github_secret"

from main import app, verify_github_webhook

client = TestClient(app)


def generate_github_signature(payload: str, secret: str) -> str:
    """Generate a valid GitHub signature for testing."""
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyGitHubWebhook:
    """Tests for GitHub signature verification function."""
    
    secret = os.environ["GITHUB_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        """Should return True for valid signature."""
        payload = b'{"action":"opened"}'
        signature = generate_github_signature(payload.decode(), self.secret)
        
        assert verify_github_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        """Should return False for invalid signature."""
        payload = b'{"action":"opened"}'
        
        assert verify_github_webhook(payload, "sha256=invalid", self.secret) is False

    def test_missing_signature_returns_false(self):
        """Should return False for missing signature."""
        payload = b'{"action":"opened"}'
        
        assert verify_github_webhook(payload, None, self.secret) is False


class TestGitHubWebhook:
    """Tests for GitHub webhook endpoint."""
    
    secret = os.environ["GITHUB_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        """Should return 401 when signature header is missing."""
        response = client.post(
            "/webhooks/github",
            content='{"ref":"refs/heads/main"}',
            headers={
                "Content-Type": "application/json",
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        """Should return 401 when signature is invalid."""
        payload = json.dumps({"ref": "refs/heads/main"})
        
        response = client.post(
            "/webhooks/github",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=invalid",
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps({
            "ref": "refs/heads/main",
            "head_commit": {"message": "Test commit"}
        })
        signature = generate_github_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks/github",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_ping_event(self):
        """Should handle ping event."""
        payload = json.dumps({"zen": "Test zen message"})
        signature = generate_github_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks/github",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "ping",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 200

    def test_handles_pull_request_event(self):
        """Should handle pull_request event."""
        payload = json.dumps({
            "action": "opened",
            "number": 1,
            "pull_request": {"title": "Test PR"}
        })
        signature = generate_github_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks/github",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 200

    def test_handles_issues_event(self):
        """Should handle issues event."""
        payload = json.dumps({
            "action": "opened",
            "issue": {"number": 1, "title": "Test Issue"}
        })
        signature = generate_github_signature(payload, self.secret)
        
        response = client.post(
            "/webhooks/github",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "issues",
                "X-GitHub-Delivery": "test-delivery-id"
            }
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for health endpoint."""
    
    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
