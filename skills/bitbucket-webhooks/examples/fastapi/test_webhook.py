import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["BITBUCKET_WEBHOOK_SECRET"] = "test_bitbucket_secret"

from main import app, verify_bitbucket_webhook

client = TestClient(app)


def generate_bitbucket_signature(payload: str, secret: str) -> str:
    """Generate a valid Bitbucket signature for testing.

    Matches Bitbucket's algorithm: HMAC-SHA256 hex over the raw body, sha256= prefix.
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyBitbucketWebhook:
    """Tests for Bitbucket signature verification function."""

    secret = os.environ["BITBUCKET_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"pullrequest":{"id":1}}'
        signature = generate_bitbucket_signature(payload.decode(), self.secret)

        assert verify_bitbucket_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"pullrequest":{"id":1}}'

        assert verify_bitbucket_webhook(payload, "sha256=invalid", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"pullrequest":{"id":1}}'

        assert verify_bitbucket_webhook(payload, None, self.secret) is False

    def test_malformed_signature_returns_false(self):
        payload = b'{"pullrequest":{"id":1}}'

        assert verify_bitbucket_webhook(payload, "not_a_valid_format", self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"pullrequest":{"id":1}}'
        signature = generate_bitbucket_signature(original.decode(), self.secret)
        tampered = b'{"pullrequest":{"id":999}}'

        assert verify_bitbucket_webhook(tampered, signature, self.secret) is False

    def test_matches_bitbucket_reference_vector(self):
        # From Bitbucket docs
        secret = "It's a Secret to Everybody"
        body = b"Hello World!"
        expected = "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9"

        assert verify_bitbucket_webhook(body, expected, secret) is True


class TestBitbucketWebhook:
    """Tests for Bitbucket webhook endpoint."""

    secret = os.environ["BITBUCKET_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/bitbucket",
            content='{"push":{"changes":[]}}',
            headers={
                "Content-Type": "application/json",
                "X-Event-Key": "repo:push",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"push": {"changes": []}})

        response = client.post(
            "/webhooks/bitbucket",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": "sha256=invalid",
                "X-Event-Key": "repo:push",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 401

    def test_valid_repo_push_returns_200(self):
        payload = json.dumps({
            "push": {
                "changes": [
                    {"new": {"name": "main"}, "commits": [{"message": "Test commit"}]}
                ]
            }
        })
        signature = generate_bitbucket_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bitbucket",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
                "X-Event-Key": "repo:push",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_pullrequest_created_event(self):
        payload = json.dumps({"pullrequest": {"id": 1, "title": "Test PR"}})
        signature = generate_bitbucket_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bitbucket",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
                "X-Event-Key": "pullrequest:created",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 200

    def test_handles_pullrequest_fulfilled_event(self):
        payload = json.dumps({"pullrequest": {"id": 1, "title": "Test PR"}})
        signature = generate_bitbucket_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bitbucket",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
                "X-Event-Key": "pullrequest:fulfilled",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 200

    def test_handles_issue_created_event(self):
        payload = json.dumps({"issue": {"id": 1, "title": "Test Issue"}})
        signature = generate_bitbucket_signature(payload, self.secret)

        response = client.post(
            "/webhooks/bitbucket",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": signature,
                "X-Event-Key": "issue:created",
                "X-Request-UUID": "test-uuid",
            }
        )
        assert response.status_code == 200


class TestHealth:
    """Tests for health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
