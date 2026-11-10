import logging
import pytest
from fastapi.testclient import TestClient
import os

# Set test environment variables BEFORE importing the app
os.environ["POSTMARK_WEBHOOK_TOKEN"] = "test-webhook-token"

from main import app

client = TestClient(app)

WEBHOOK_URL = "/webhooks/postmark"
VALID_TOKEN = "test-webhook-token"


def assert_handler_ran(caplog, *expected_lines):
    """Check the logs too: the route logs handler errors and still returns 200.

    Fixtures follow the sample payloads in Postmark's webhook docs.
    """
    assert "Error processing" not in caplog.text
    messages = [record.getMessage() for record in caplog.records]
    for line in expected_lines:
        assert line in messages


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

    def test_subscription_change_null_message_id(self, caplog):
        """Postmark sends MessageID: null for manual suppressions and reactivations,
        and drops any event that gets a 4xx."""
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json={
                    "RecordType": "SubscriptionChange",
                    "MessageID": None,
                    "ServerID": 23,
                    "MessageStream": "outbound",
                    "ChangedAt": "2026-11-05T16:33:54.9070259Z",
                    "Recipient": "user@example.com",
                    "Origin": "Customer",
                    "SuppressSending": True,
                    "SuppressionReason": "ManualSuppression",
                },
            )
        assert response.status_code == 200
        assert "Subscription change: user@example.com" in caplog.text

    def test_subscription_change_without_message_id(self, caplog):
        """SubscriptionChange without a MessageID field is accepted too."""
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json={
                    "RecordType": "SubscriptionChange",
                    "ChangedAt": "2026-11-05T16:33:54.9070259Z",
                    "Recipient": "user@example.com",
                    "SuppressSending": False,
                },
            )
        assert response.status_code == 200
        assert "Subscription change: user@example.com" in caplog.text

    def test_other_event_null_message_id_rejected(self):
        """Only SubscriptionChange is documented as sending MessageID: null."""
        response = client.post(
            f"{WEBHOOK_URL}?token={VALID_TOKEN}",
            json={"RecordType": "Bounce", "MessageID": None},
        )
        assert response.status_code == 400

    def test_bounce_event(self, caplog):
        """Test handling of bounce events."""
        bounce_event = {
            "RecordType": "Bounce",
            "MessageStream": "outbound",
            "ID": 692560173,
            "Type": "HardBounce",
            "TypeCode": 1,
            "Name": "Hard bounce",
            "Tag": "welcome-email",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            },
            "ServerID": 23,
            "Description": "The server was unable to deliver your message",
            "Details": "Test bounce details",
            "Email": "user@example.com",
            "From": "sender@example.com",
            "BouncedAt": "2026-11-05T16:33:54.9070259Z",
            "DumpAvailable": True,
            "Inactive": True,
            "CanActivate": True,
            "Subject": "Saying Hello!"
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=bounce_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Bounce: user@example.com",
            "  Type: HardBounce",
            "  Bounced at: 2026-11-05T16:33:54.9070259Z",
        )

    def test_spam_complaint_event(self, caplog):
        """Test handling of spam complaint events."""
        spam_complaint_event = {
            "RecordType": "SpamComplaint",
            "MessageStream": "outbound",
            "ID": 692560174,
            "Type": "SpamComplaint",
            "TypeCode": 100001,
            "Name": "Spam complaint",
            "Tag": "welcome-email",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            },
            "ServerID": 23,
            "Description": "The subscriber explicitly marked this message as spam.",
            "Details": "Test spam complaint details",
            "Email": "user@example.com",
            "From": "sender@example.com",
            "BouncedAt": "2026-11-05T16:33:54.9070259Z",
            "DumpAvailable": True,
            "Inactive": True,
            "CanActivate": False,
            "Subject": "Saying Hello!"
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=spam_complaint_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Spam complaint: user@example.com",
            "  Complained at: 2026-11-05T16:33:54.9070259Z",
        )

    def test_open_event(self, caplog):
        """Test handling of open events."""
        open_event = {
            "RecordType": "Open",
            "MessageStream": "outbound",
            "FirstOpen": True,
            "Client": {
                "Name": "Chrome 140.0.7339.80",
                "Company": "Google",
                "Family": "Chrome"
            },
            "OS": {
                "Name": "macOS 26 Tahoe",
                "Company": "Apple Computer, Inc.",
                "Family": "macOS"
            },
            "Platform": "WebMail",
            "UserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36",
            "ReadSeconds": 5,
            "Geo": {
                "CountryISOCode": "US",
                "Country": "United States",
                "City": "Houston",
                "IP": "203.0.113.42"
            },
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            },
            "ReceivedAt": "2026-11-05T16:33:54.9070259Z",
            "Tag": "welcome-email",
            "Recipient": "user@example.com"
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=open_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Email opened: user@example.com",
            "  Opened at: 2026-11-05T16:33:54.9070259Z",
            "  Platform: WebMail",
        )

    def test_click_event(self, caplog):
        """Test handling of click events."""
        click_event = {
            "RecordType": "Click",
            "MessageStream": "outbound",
            "ClickLocation": "HTML",
            "Client": {
                "Name": "Chrome 140.0.7339.80",
                "Company": "Google",
                "Family": "Chrome"
            },
            "OS": {
                "Name": "macOS 26 Tahoe",
                "Company": "Apple Computer, Inc.",
                "Family": "macOS"
            },
            "Platform": "Desktop",
            "UserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36",
            "OriginalLink": "https://example.com/confirm-your-address",
            "Geo": {
                "CountryISOCode": "US",
                "Country": "United States",
                "City": "Houston",
                "IP": "203.0.113.42"
            },
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            },
            "ReceivedAt": "2026-11-05T16:33:54.9070259Z",
            "Tag": "welcome-email",
            "Recipient": "user@example.com"
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=click_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Link clicked: user@example.com",
            "  Clicked at: 2026-11-05T16:33:54.9070259Z",
            "  Link: https://example.com/confirm-your-address",
        )

    def test_delivery_event(self, caplog):
        """Test handling of delivery events."""
        delivery_event = {
            "RecordType": "Delivery",
            "MessageStream": "outbound",
            "ServerID": 23,
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "Recipient": "user@example.com",
            "Tag": "welcome-email",
            "DeliveredAt": "2026-11-05T16:33:54.9070259Z",
            "Details": "250 2.0.0 OK",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            }
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=delivery_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Email delivered: user@example.com",
            "  Delivered at: 2026-11-05T16:33:54.9070259Z",
            "  Server: 23",
        )

    def test_subscription_change_event(self, caplog):
        """Test handling of subscription change events."""
        subscription_change_event = {
            "RecordType": "SubscriptionChange",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "ServerID": 23,
            "MessageStream": "outbound",
            "ChangedAt": "2026-11-05T16:33:54.9070259Z",
            "Recipient": "user@example.com",
            "Origin": "Recipient",
            "SuppressSending": True,
            "SuppressionReason": "HardBounce",
            "Tag": "welcome-email",
            "Metadata": {
                "PropA": "some value",
                "PropB": "some value"
            }
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=subscription_change_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Subscription change: user@example.com",
            "  Changed at: 2026-11-05T16:33:54.9070259Z",
            "  Suppression reason: HardBounce",
        )

    def test_inbound_event(self, caplog):
        """Test handling of inbound events."""
        inbound_event = {
            "FromName": "Sender Name",
            "MessageStream": "inbound",
            "From": "sender@example.com",
            "FromFull": {
                "Email": "sender@example.com",
                "Name": "Sender Name",
                "MailboxHash": ""
            },
            "To": "yourhash+SampleHash@inbound.postmarkapp.com",
            "ToFull": [
                {
                    "Email": "yourhash+SampleHash@inbound.postmarkapp.com",
                    "Name": "",
                    "MailboxHash": "SampleHash"
                }
            ],
            "OriginalRecipient": "yourhash+SampleHash@inbound.postmarkapp.com",
            "Subject": "Saying Hello!",
            "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
            "ReplyTo": "sender@example.com",
            "MailboxHash": "SampleHash",
            "Date": "Thu, 5 Nov 2026 16:33:54 -0500",
            "TextBody": "This is a test text body.",
            "HtmlBody": "<html><body><p>This is a test html body.</p></body></html>",
            "StrippedTextReply": "This is the reply text",
            "Tag": "welcome-email",
            "Headers": [
                {
                    "Name": "X-Spam-Status",
                    "Value": "No"
                }
            ],
            "Attachments": []
        }
        with caplog.at_level(logging.INFO):
            response = client.post(
                f"{WEBHOOK_URL}?token={VALID_TOKEN}",
                json=inbound_event
            )
        assert response.status_code == 200
        assert_handler_ran(
            caplog,
            "Inbound email from: sender@example.com",
            "  Subject: Saying Hello!",
        )

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