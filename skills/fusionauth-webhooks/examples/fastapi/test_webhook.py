import os
import json
import hmac
import hashlib
import base64
import pytest
from fastapi.testclient import TestClient
import jwt

# Set test environment variables before importing app
TEST_SECRET = "test_webhook_secret_for_hmac_signing"
os.environ["FUSIONAUTH_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_fusionauth_webhook

client = TestClient(app)


def generate_fusionauth_signature(payload: str, secret: str) -> str:
    """
    Generate a valid FusionAuth signature JWT for testing.
    FusionAuth signs webhooks with a JWT containing request_body_sha256 claim.
    """
    # Calculate SHA-256 hash of body (base64 encoded)
    body_hash = base64.b64encode(hashlib.sha256(payload.encode()).digest()).decode()

    # Create JWT with body hash claim
    token = jwt.encode(
        {"request_body_sha256": body_hash},
        secret,
        algorithm="HS256",
        headers={"typ": "JWT"}
    )

    return token


class TestFusionAuthWebhook:
    """Tests for FusionAuth webhook endpoint."""

    webhook_secret = TEST_SECRET

    def test_missing_signature_returns_401(self):
        """Should return 401 when signature header is missing."""
        payload = json.dumps({
            "event": {
                "id": "evt_test",
                "type": "user.create",
                "user": {"id": "user_123"}
            }
        })

        response = client.post(
            "/webhooks/fusionauth",
            content=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        """Should return 401 when signature is invalid."""
        payload = json.dumps({
            "event": {
                "id": "evt_test",
                "type": "user.create",
                "user": {"id": "user_123"}
            }
        })

        response = client.post(
            "/webhooks/fusionauth",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-FusionAuth-Signature-JWT": "invalid.jwt.token"
            }
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps({
            "event": {
                "id": "evt_test_valid",
                "type": "user.create",
                "user": {"id": "user_valid"}
            }
        })
        signature = generate_fusionauth_signature(payload, self.webhook_secret)

        response = client.post(
            "/webhooks/fusionauth",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-FusionAuth-Signature-JWT": signature
            }
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_tampered_payload_returns_401(self):
        """Should return 401 when payload has been tampered with."""
        original_payload = json.dumps({
            "event": {
                "id": "evt_test",
                "type": "user.create",
                "user": {"id": "user_123"}
            }
        })
        signature = generate_fusionauth_signature(original_payload, self.webhook_secret)

        tampered_payload = json.dumps({
            "event": {
                "id": "evt_test",
                "type": "user.create",
                "user": {"id": "user_tampered"}
            }
        })

        response = client.post(
            "/webhooks/fusionauth",
            content=tampered_payload,
            headers={
                "Content-Type": "application/json",
                "X-FusionAuth-Signature-JWT": signature
            }
        )
        assert response.status_code == 401

    def test_handles_different_event_types(self):
        """Should handle various FusionAuth event types."""
        event_types = [
            "user.create",
            "user.update",
            "user.delete",
            "user.deactivate",
            "user.reactivate",
            "user.login.success",
            "user.login.failed",
            "user.registration.create",
            "user.registration.update",
            "user.registration.delete",
            "user.email.verified",
            "unknown.event.type"
        ]

        for event_type in event_types:
            payload = json.dumps({
                "event": {
                    "id": f"evt_{event_type.replace('.', '_')}",
                    "type": event_type,
                    "user": {"id": "user_123", "email": "test@example.com"},
                    "applicationId": "app_123"
                }
            })
            signature = generate_fusionauth_signature(payload, self.webhook_secret)

            response = client.post(
                "/webhooks/fusionauth",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-FusionAuth-Signature-JWT": signature
                }
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestVerifyFusionAuthWebhook:
    """Tests for verify_fusionauth_webhook function."""

    secret = TEST_SECRET

    def test_returns_false_for_missing_jwt(self):
        """Should return False when JWT is missing."""
        result = verify_fusionauth_webhook(b"{}", None, self.secret)
        assert result is False

    def test_returns_false_for_missing_secret(self):
        """Should return False when secret is missing."""
        jwt_token = generate_fusionauth_signature("{}", self.secret)
        result = verify_fusionauth_webhook(b"{}", jwt_token, None)
        assert result is False

    def test_returns_true_for_valid_signature(self):
        """Should return True for valid signature."""
        payload = '{"test": true}'
        jwt_token = generate_fusionauth_signature(payload, self.secret)
        result = verify_fusionauth_webhook(payload.encode(), jwt_token, self.secret)
        assert result is True

    def test_returns_false_for_wrong_secret(self):
        """Should return False when using wrong secret."""
        payload = '{"test": true}'
        jwt_token = generate_fusionauth_signature(payload, self.secret)
        result = verify_fusionauth_webhook(payload.encode(), jwt_token, "wrong_secret")
        assert result is False

    def test_returns_false_for_modified_payload(self):
        """Should return False when payload has been modified."""
        original_payload = '{"test": true}'
        jwt_token = generate_fusionauth_signature(original_payload, self.secret)
        result = verify_fusionauth_webhook(b'{"test": false}', jwt_token, self.secret)
        assert result is False


class TestHealth:
    """Tests for health endpoint."""

    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
