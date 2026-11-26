import hashlib
import hmac
import json
import os
import time

# Set the webhook secret before importing the app.
os.environ["AIRWALLEX_WEBHOOK_SECRET"] = "test_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["AIRWALLEX_WEBHOOK_SECRET"]


def sign(payload: str, secret: str, timestamp: str | None = None):
    """Generate a valid Airwallex signature: HMAC-SHA256 over (x-timestamp + raw_body)."""
    if timestamp is None:
        timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        secret.encode("utf-8"),
        timestamp.encode("utf-8") + payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return timestamp, signature


def event_payload(name: str, object_id: str = "int_test_123") -> str:
    return json.dumps(
        {
            "id": "evt_test_123",
            "name": name,
            "account_id": "acct_test_123",
            "data": {"object": {"id": object_id, "status": "SUCCEEDED"}},
            "created_at": "2026-07-24T12:34:56+0000",
        }
    )


class TestAirwallexWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/airwallex",
            content=event_payload("payment_intent.succeeded"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        payload = event_payload("payment_intent.succeeded")
        response = client.post(
            "/webhooks/airwallex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-timestamp": str(int(time.time() * 1000)),
                "x-signature": "deadbeef",
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        original = event_payload("payment_intent.succeeded", "int_original")
        timestamp, signature = sign(original, WEBHOOK_SECRET)
        tampered = event_payload("payment_intent.succeeded", "int_tampered")
        response = client.post(
            "/webhooks/airwallex",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "x-timestamp": timestamp,
                "x-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = event_payload("payment_intent.succeeded")
        old_ts = str(int(time.time() * 1000) - 10 * 60 * 1000)  # 10 min ago
        _, signature = sign(payload, WEBHOOK_SECRET, old_ts)
        response = client.post(
            "/webhooks/airwallex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-timestamp": old_ts,
                "x-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = event_payload("payment_intent.succeeded")
        timestamp, signature = sign(payload, WEBHOOK_SECRET)
        response = client.post(
            "/webhooks/airwallex",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-timestamp": timestamp,
                "x-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_documented_event_types(self):
        names = [
            "payment_intent.succeeded",
            "payment_attempt.paid",
            "refund.settled",
            "refund.failed",
            "payment_consent.verified",
            "payment_dispute.requires_response",
            "some.unhandled.event",
        ]
        for name in names:
            payload = event_payload(name)
            timestamp, signature = sign(payload, WEBHOOK_SECRET)
            response = client.post(
                "/webhooks/airwallex",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-timestamp": timestamp,
                    "x-signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for event type: {name}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
