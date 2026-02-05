import pytest
from fastapi.testclient import TestClient
import os

# Set test environment variables BEFORE importing the app
os.environ["POSTMARK_WEBHOOK_TOKEN"] = "test-webhook-token"

from main import app

client = TestClient(app)

WEBHOOK_URL = "/webhooks/postmark"
VALID_TOKEN = "test-webhook-token"


class TestPostmarkWebhook:
    """Test Postmark webhook handler."""

    def test_health_check(self):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {
            "status": "ok",
            "service": "postmark-webhook-handler"
        }

    def test_valid_token_accepted(self):
        """Test that requests with valid token are accepted."""
        payload = {
            "RecordType": "Bounce",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "ServerID": 23
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=payload
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_token_rejected(self):
        """Test that requests with invalid token are rejected."""
        payload = {
            "RecordType": "Bounce",
            "MessageID": "test"
        }
        response = client.post(
            f"{WEBHOOK_URL}?token=invalid-token",
            json=payload
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized"

    def test_missing_token_rejected(self):
        """Test that requests without token are rejected."""
        payload = {
            "RecordType": "Bounce",
            "MessageID": "test"
        }
        response = client.post(WEBHOOK_URL, json=payload)
        assert response.status_code == 401

    def test_invalid_payload_structure(self):
        """Test that invalid payload structure is rejected."""
        # Missing RecordType
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json={"MessageID": "test"}
        )
        assert response.status_code == 400
        assert "Invalid payload structure" in response.json()["detail"]

        # Missing MessageID
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json={"RecordType": "Bounce"}
        )
        assert response.status_code == 400

    def test_bounce_event(self):
        """Test handling of bounce events."""
        bounce_event = {
            "RecordType": "Bounce",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Type": "HardBounce",
            "TypeCode": 1,
            "Email": "bounced@example.com",
            "Description": "The email address does not exist",
            "Details": "smtp;550 5.1.1 The email account does not exist",
            "BouncedAt": "2024-01-15T10:30:00Z",
            "DumpAvailable": True,
            "Inactive": True,
            "CanActivate": False,
            "ServerID": 23,
            "MessageStream": "outbound",
            "Tag": "welcome-email",
            "Metadata": {
                "user_id": "12345"
            }
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=bounce_event
        )
        assert response.status_code == 200

    def test_spam_complaint_event(self):
        """Test handling of spam complaint events."""
        spam_event = {
            "RecordType": "SpamComplaint",
            "MessageID": "test-message-id",
            "Email": "user@example.com",
            "BouncedAt": "2024-01-15T10:30:00Z",
            "ServerID": 23,
            "MessageStream": "outbound"
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=spam_event
        )
        assert response.status_code == 200

    def test_open_event(self):
        """Test handling of open events."""
        open_event = {
            "RecordType": "Open",
            "MessageID": "test-message-id",
            "Email": "user@example.com",
            "ReceivedAt": "2024-01-15T10:30:00Z",
            "Platform": "Gmail",
            "UserAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "ServerID": 23
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=open_event
        )
        assert response.status_code == 200

    def test_click_event(self):
        """Test handling of click events."""
        click_event = {
            "RecordType": "Click",
            "MessageID": "test-message-id",
            "Email": "user@example.com",
            "ClickedAt": "2024-01-15T10:30:00Z",
            "OriginalLink": "https://example.com/verify",
            "ClickLocation": "HTML",
            "Platform": "Gmail",
            "UserAgent": "Mozilla/5.0",
            "ServerID": 23
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=click_event
        )
        assert response.status_code == 200

    def test_delivery_event(self):
        """Test handling of delivery events."""
        delivery_event = {
            "RecordType": "Delivery",
            "MessageID": "test-message-id",
            "Email": "user@example.com",
            "DeliveredAt": "2024-01-15T10:30:00Z",
            "ServerID": 23,
            "Details": "Test details"
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=delivery_event
        )
        assert response.status_code == 200

    def test_subscription_change_event(self):
        """Test handling of subscription change events."""
        subscription_event = {
            "RecordType": "SubscriptionChange",
            "MessageID": "test-message-id",
            "Email": "user@example.com",
            "ChangedAt": "2024-01-15T10:30:00Z",
            "SuppressionReason": "ManualSuppression",
            "ServerID": 23
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=subscription_event
        )
        assert response.status_code == 200

    def test_unknown_event_type(self):
        """Test that unknown event types are handled gracefully."""
        unknown_event = {
            "RecordType": "UnknownType",
            "MessageID": "test-message-id",
            "ServerID": 23
        }
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json=unknown_event
        )
        # Should still return 200
        assert response.status_code == 200

    def test_invalid_json_payload(self):
        """Test handling of invalid JSON payload."""
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            content="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        assert "Invalid JSON payload" in response.json()["detail"]