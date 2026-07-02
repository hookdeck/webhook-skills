import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "test_razorpay_secret"

from main import app, verify_razorpay_webhook

client = TestClient(app)

SECRET = os.environ["RAZORPAY_WEBHOOK_SECRET"]


def generate_razorpay_signature(payload: str, secret: str) -> str:
    """Generate a valid Razorpay signature for testing.

    Matches Razorpay's scheme: HMAC-SHA256 (hex) over the raw body.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_event(event: str, entities: dict) -> str:
    return json.dumps(
        {
            "entity": "event",
            "account_id": "acc_test",
            "event": event,
            "contains": list(entities.keys()),
            "payload": entities,
            "created_at": 1590597321,
        }
    )


class TestVerifyRazorpayWebhook:
    """Tests for the Razorpay signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"event":"payment.captured"}'
        signature = generate_razorpay_signature(payload.decode(), SECRET)

        assert verify_razorpay_webhook(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event":"payment.captured"}'

        assert verify_razorpay_webhook(payload, "deadbeef", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event":"payment.captured"}'

        assert verify_razorpay_webhook(payload, None, SECRET) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"event":"payment.captured","amount":100}'
        signature = generate_razorpay_signature(original.decode(), SECRET)
        tampered = b'{"event":"payment.captured","amount":999}'

        assert verify_razorpay_webhook(tampered, signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"event":"payment.captured"}'
        signature = generate_razorpay_signature(payload.decode(), SECRET)

        assert verify_razorpay_webhook(payload, signature, "wrong_secret") is False


class TestRazorpayWebhookEndpoint:
    """Tests for the Razorpay webhook endpoint."""

    def _post(self, payload: str, signature: str | None):
        headers = {"Content-Type": "application/json"}
        if signature is not None:
            headers["X-Razorpay-Signature"] = signature
        return client.post("/webhooks/razorpay", content=payload, headers=headers)

    def test_missing_signature_returns_400(self):
        payload = build_event("payment.captured", {"payment": {"entity": {"id": "pay_1"}}})
        response = self._post(payload, None)

        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = build_event("payment.captured", {"payment": {"entity": {"id": "pay_1"}}})
        response = self._post(payload, "deadbeef")

        assert response.status_code == 400

    def test_valid_payment_captured_returns_200(self):
        payload = build_event(
            "payment.captured",
            {"payment": {"entity": {"id": "pay_1", "amount": 5000, "currency": "INR"}}},
        )
        signature = generate_razorpay_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_payment_failed(self):
        payload = build_event(
            "payment.failed",
            {"payment": {"entity": {"id": "pay_2", "error_description": "card declined"}}},
        )
        signature = generate_razorpay_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_order_paid(self):
        payload = build_event(
            "order.paid",
            {
                "order": {"entity": {"id": "order_1", "amount_paid": 5000}},
                "payment": {"entity": {"id": "pay_3"}},
            },
        )
        signature = generate_razorpay_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_refund_processed(self):
        payload = build_event(
            "refund.processed",
            {
                "refund": {"entity": {"id": "rfnd_1", "payment_id": "pay_1"}},
                "payment": {"entity": {"id": "pay_1"}},
            },
        )
        signature = generate_razorpay_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_subscription_charged(self):
        payload = build_event(
            "subscription.charged",
            {
                "subscription": {"entity": {"id": "sub_1"}},
                "payment": {"entity": {"id": "pay_4"}},
            },
        )
        signature = generate_razorpay_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
