import os
import json
import hmac
import hashlib
import base64
import time
import secrets
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RESEND_API_KEY"] = "re_test_fake_key"
os.environ["RESEND_WEBHOOK_SECRET"] = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n"

from main import app

client = TestClient(app)


def generate_svix_signature(
    payload: str, secret: str, msg_id: str = None, timestamp: str = None
) -> dict:
    """Generate valid Svix headers for testing."""
    msg_id = msg_id or f"msg_{secrets.token_hex(16)}"
    timestamp = timestamp or str(int(time.time()))

    # Remove 'whsec_' prefix and decode secret
    if secret.startswith("whsec_"):
        secret = secret[6:]
    secret_bytes = base64.b64decode(secret)

    # Create signed content
    signed_content = f"{msg_id}.{timestamp}.{payload}"

    # Compute signature
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()

    return {
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": f"v1,{signature}",
    }


class TestResendWebhook:
    """Tests for Resend webhook endpoint."""

    webhook_secret = os.environ["RESEND_WEBHOOK_SECRET"]

    def test_missing_headers_returns_400(self):
        """Should return 400 when signature headers are missing."""
        response = client.post(
            "/webhooks/resend",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing webhook signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        """Should return 400 when signature is invalid."""
        payload = json.dumps(
            {
                "type": "email.sent",
                "created_at": "2024-01-01T00:00:00Z",
                "data": {"email_id": "test_email_123"},
            }
        )

        response = client.post(
            "/webhooks/resend",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "svix-id": "msg_test123",
                "svix-timestamp": str(int(time.time())),
                "svix-signature": "v1,invalid_signature",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        """Should return 200 when signature is valid."""
        payload = json.dumps(
            {
                "type": "email.sent",
                "created_at": "2024-01-01T00:00:00Z",
                "data": {"email_id": "test_email_valid"},
            }
        )
        headers = generate_svix_signature(payload, self.webhook_secret)

        response = client.post(
            "/webhooks/resend",
            content=payload,
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_event_types(self):
        """Should handle various Resend event types."""
        event_types = [
            "email.sent",
            "email.delivered",
            "email.delivery_delayed",
            "email.bounced",
            "email.complained",
            "email.opened",
            "email.clicked",
            "email.received",
            "unknown.event.type",
        ]

        for event_type in event_types:
            payload = json.dumps(
                {
                    "type": event_type,
                    "created_at": "2024-01-01T00:00:00Z",
                    "data": {"email_id": f"test_{event_type.replace('.', '_')}"},
                }
            )
            headers = generate_svix_signature(payload, self.webhook_secret)

            response = client.post(
                "/webhooks/resend",
                content=payload,
                headers={"Content-Type": "application/json", **headers},
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"

    def test_expired_timestamp_returns_400(self):
        """Should return 400 when timestamp is too old."""
        payload = json.dumps(
            {
                "type": "email.sent",
                "created_at": "2024-01-01T00:00:00Z",
                "data": {"email_id": "test_expired"},
            }
        )

        # Use timestamp from 10 minutes ago
        old_timestamp = str(int(time.time()) - 600)
        headers = generate_svix_signature(
            payload, self.webhook_secret, timestamp=old_timestamp
        )

        response = client.post(
            "/webhooks/resend",
            content=payload,
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        """Should return 400 when payload has been tampered with."""
        original_payload = json.dumps(
            {"type": "email.sent", "data": {"email_id": "original_id"}}
        )

        # Sign with original payload
        headers = generate_svix_signature(original_payload, self.webhook_secret)

        # Send tampered payload
        tampered_payload = json.dumps(
            {"type": "email.sent", "data": {"email_id": "tampered_id"}}
        )

        response = client.post(
            "/webhooks/resend",
            content=tampered_payload,
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 400


class TestHealth:
    """Tests for health endpoint."""

    def test_health_returns_ok(self):
        """Should return health status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
