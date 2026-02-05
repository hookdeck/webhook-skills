import os
import json
import hmac
import hashlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

# Test webhook secret
TEST_SECRET = "test_webhook_secret_12345"

# Set up test environment before importing app
os.environ["VERCEL_WEBHOOK_SECRET"] = TEST_SECRET

from main import app

# Create test client
client = TestClient(app)


def generate_vercel_signature(body: bytes, secret: str) -> str:
    """Generate a valid Vercel webhook signature."""
    return hmac.new(
        secret.encode(),
        body,
        hashlib.sha1
    ).hexdigest()


def create_test_event(event_type: str, payload: dict = None) -> dict:
    """Create a test webhook event."""
    return {
        "id": "event_test123",
        "type": event_type,
        "createdAt": int(datetime.now().timestamp() * 1000),
        "payload": payload or {},
        "region": "sfo1"
    }


class TestVercelWebhook:
    """Test suite for Vercel webhook handler."""

    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        """Set up test environment."""
        # Set test webhook secret
        monkeypatch.setenv("VERCEL_WEBHOOK_SECRET", TEST_SECRET)

    def test_health_check(self):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "service": "vercel-webhook-handler"}

    def test_root_endpoint(self):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Vercel Webhook Handler"
        assert "endpoints" in data

    def test_valid_webhook_signature(self):
        """Test webhook with valid signature."""
        event = create_test_event("deployment.created", {
            "deployment": {
                "id": "dpl_test123",
                "name": "test-app",
                "url": "https://test-app.vercel.app"
            },
            "project": {
                "id": "prj_test123",
                "name": "test-app"
            },
            "team": {
                "id": "team_test123",
                "name": "test-team"
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_signature(self):
        """Test webhook with missing signature."""
        event = create_test_event("deployment.created")

        response = client.post(
            "/webhooks/vercel",
            json=event,
            headers={"content-type": "application/json"}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing x-vercel-signature header"

    def test_invalid_signature(self):
        """Test webhook with invalid signature."""
        event = create_test_event("deployment.created")
        body = json.dumps(event).encode()

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": "invalid_signature_12345",
                "content-type": "application/json"
            }
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_wrong_secret(self):
        """Test webhook with signature from wrong secret."""
        event = create_test_event("deployment.created")
        body = json.dumps(event).encode()
        wrong_signature = generate_vercel_signature(body, "wrong_secret")

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": wrong_signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_deployment_succeeded_event(self):
        """Test deployment.succeeded event handling."""
        event = create_test_event("deployment.succeeded", {
            "deployment": {
                "id": "dpl_success123",
                "name": "test-app",
                "url": "https://test-app.vercel.app",
                "duration": 45000
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_deployment_error_event(self):
        """Test deployment.error event handling."""
        event = create_test_event("deployment.error", {
            "deployment": {
                "id": "dpl_error123",
                "error": "Build failed"
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_project_created_event(self):
        """Test project.created event handling."""
        event = create_test_event("project.created", {
            "project": {
                "id": "prj_new123",
                "name": "new-project",
                "framework": "nextjs"
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_attack_detected_event(self):
        """Test attack.detected event handling."""
        event = create_test_event("attack.detected", {
            "attack": {
                "type": "ddos",
                "action": "blocked",
                "ip": "192.0.2.1"
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unknown_event_type(self):
        """Test handling of unknown event types."""
        event = create_test_event("unknown.event.type", {
            "custom": "data"
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_malformed_json(self):
        """Test webhook with malformed JSON."""
        body = b"invalid json{"
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    def test_missing_webhook_secret(self, monkeypatch):
        """Test behavior when webhook secret is not configured."""
        # Remove the secret
        monkeypatch.delenv("VERCEL_WEBHOOK_SECRET", raising=False)
        # Also need to update the app's cached value
        import main
        main.WEBHOOK_SECRET = ""

        event = create_test_event("deployment.created")
        body = json.dumps(event).encode()

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": "any_signature",
                "content-type": "application/json"
            }
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "Webhook secret not configured"

        # Restore the secret for other tests
        main.WEBHOOK_SECRET = TEST_SECRET

    def test_deployment_with_git_metadata(self):
        """Test deployment event with git metadata."""
        event = create_test_event("deployment.created", {
            "deployment": {
                "id": "dpl_git123",
                "name": "test-app",
                "url": "https://test-app.vercel.app",
                "meta": {
                    "githubCommitRef": "main",
                    "githubCommitSha": "abc123def456",
                    "githubCommitMessage": "feat: Add new feature"
                }
            },
            "project": {
                "id": "prj_test123",
                "name": "test-app"
            }
        })

        body = json.dumps(event).encode()
        signature = generate_vercel_signature(body, TEST_SECRET)

        response = client.post(
            "/webhooks/vercel",
            content=body,
            headers={
                "x-vercel-signature": signature,
                "content-type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}