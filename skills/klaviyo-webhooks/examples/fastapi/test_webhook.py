import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["KLAVIYO_WEBHOOK_SECRET"] = "test_klaviyo_secret_key_1234"

from main import app, verify_klaviyo_webhook

client = TestClient(app)

SECRET = os.environ["KLAVIYO_WEBHOOK_SECRET"]
TIMESTAMP = "1751457600"


def generate_klaviyo_signature(payload: bytes, timestamp: str, secret: str) -> str:
    """Generate a valid Klaviyo signature for testing.

    Matches Klaviyo's scheme: HMAC-SHA256(secret, raw_body + timestamp), hex.
    """
    mac = hmac.new(secret.encode(), payload, hashlib.sha256)
    mac.update(timestamp.encode())
    return mac.hexdigest()


def sample_payload(topic: str = "event:klaviyo.opened_email") -> bytes:
    return json.dumps(
        {
            "data": [
                {"external_id": "evt_123", "topic": topic, "payload": {"foo": "bar"}}
            ],
            "meta": {
                "klaviyo_webhook_id": "whk_1",
                "timestamp": "2026-07-02T12:00:00+00:00",
            },
        }
    ).encode()


class TestVerifyKlaviyoWebhook:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = sample_payload()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        assert verify_klaviyo_webhook(payload, TIMESTAMP, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = sample_payload()

        assert verify_klaviyo_webhook(payload, TIMESTAMP, "deadbeef", SECRET) is False

    def test_tampered_timestamp_returns_false(self):
        payload = sample_payload()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        assert verify_klaviyo_webhook(payload, "9999999999", signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = sample_payload()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        assert verify_klaviyo_webhook(payload, TIMESTAMP, signature, "wrong") is False


class TestKlaviyoWebhook:
    """Tests for the webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/klaviyo",
            content=sample_payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/klaviyo",
            content=sample_payload(),
            headers={
                "Content-Type": "application/json",
                "Klaviyo-Signature": "invalid",
                "Klaviyo-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = sample_payload()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/klaviyo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Klaviyo-Signature": signature,
                "Klaviyo-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_tampered_timestamp_returns_400(self):
        payload = sample_payload()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/klaviyo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Klaviyo-Signature": signature,
                "Klaviyo-Timestamp": "9999999999",
            },
        )
        assert response.status_code == 400

    def test_handles_different_topics(self):
        topics = [
            "event:klaviyo.opened_email",
            "event:klaviyo.clicked_email",
            "event:klaviyo.bounced_email",
            "event:klaviyo.marked_email_as_spam",
            "event:klaviyo.unsubscribed_from_email_marketing",
            "event:klaviyo.sent_sms",
            "event:klaviyo.received_sms",
            "event:klaviyo.submitted_review",
        ]

        for topic in topics:
            payload = sample_payload(topic)
            signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

            response = client.post(
                "/webhooks/klaviyo",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Klaviyo-Signature": signature,
                    "Klaviyo-Timestamp": TIMESTAMP,
                },
            )
            assert response.status_code == 200, f"Failed for topic: {topic}"

    def test_processes_batch_of_events(self):
        payload = json.dumps(
            {
                "data": [
                    {"external_id": "e1", "topic": "event:klaviyo.opened_email", "payload": {}},
                    {"external_id": "e2", "topic": "event:klaviyo.clicked_email", "payload": {}},
                ],
                "meta": {"klaviyo_webhook_id": "whk_1"},
            }
        ).encode()
        signature = generate_klaviyo_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/klaviyo",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Klaviyo-Signature": signature,
                "Klaviyo-Timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
