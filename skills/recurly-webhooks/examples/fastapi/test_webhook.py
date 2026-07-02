import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RECURLY_WEBHOOK_SECRET"] = "test_endpoint_secret"
os.environ.pop("RECURLY_WEBHOOK_USER", None)
os.environ.pop("RECURLY_WEBHOOK_PASSWORD", None)

from main import app

client = TestClient(app)

WEBHOOK_SECRET = "test_endpoint_secret"


def generate_recurly_signature(payload: str, secret: str, timestamp: str = "1659641851000") -> str:
    """Generate a valid Recurly signature header for testing.

    HMAC-SHA256 over f"{timestamp}.{payload}", hex-encoded -> "<timestamp>,<sig>".
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{timestamp},{signature}"


NEW_SUBSCRIPTION_PAYLOAD = json.dumps(
    {
        "new_subscription_notification": {
            "account": {"account_code": "1", "email": "verena@example.com"},
            "subscription": {"uuid": "8435b96eb70e5640a0eaf82d0e0d6d", "state": "active"},
        }
    }
)


class TestRecurlyWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/recurly",
            content=NEW_SUBSCRIPTION_PAYLOAD,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing recurly-signature" in response.text

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/recurly",
            content=NEW_SUBSCRIPTION_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "recurly-signature": "1659641851000,deadbeef",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.text

    def test_tampered_payload_returns_400(self):
        # Sign the original body, then send a modified one
        signature = generate_recurly_signature(NEW_SUBSCRIPTION_PAYLOAD, WEBHOOK_SECRET)
        tampered = json.dumps(
            {"new_subscription_notification": {"subscription": {"uuid": "tampered"}}}
        )
        response = client.post(
            "/webhooks/recurly",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "recurly-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        signature = generate_recurly_signature(NEW_SUBSCRIPTION_PAYLOAD, WEBHOOK_SECRET)
        response = client.post(
            "/webhooks/recurly",
            content=NEW_SUBSCRIPTION_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "recurly-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_any_of_multiple_signatures(self):
        # Header carries an old (expiring) signature and the current valid one
        timestamp = "1659641851000"
        valid = hmac.new(
            WEBHOOK_SECRET.encode("utf-8"),
            f"{timestamp}.{NEW_SUBSCRIPTION_PAYLOAD}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        header = f"{timestamp},{'0' * 64},{valid}"
        response = client.post(
            "/webhooks/recurly",
            content=NEW_SUBSCRIPTION_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "recurly-signature": header,
            },
        )
        assert response.status_code == 200

    def test_handles_different_notification_types(self):
        types = [
            "new_subscription_notification",
            "updated_subscription_notification",
            "canceled_subscription_notification",
            "expired_subscription_notification",
            "renewed_subscription_notification",
            "successful_payment_notification",
            "failed_payment_notification",
            "unknown_notification",
        ]
        for notification_type in types:
            body = json.dumps(
                {notification_type: {"subscription": {"uuid": "s"}, "transaction": {"uuid": "t"}}}
            )
            signature = generate_recurly_signature(body, WEBHOOK_SECRET)
            response = client.post(
                "/webhooks/recurly",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "recurly-signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for {notification_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
