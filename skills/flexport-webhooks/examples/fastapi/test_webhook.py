import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FLEXPORT_WEBHOOK_SECRET"] = "test_flexport_secret"

from main import app, verify_flexport_webhook

client = TestClient(app)


def generate_flexport_signature(payload: str, secret: str) -> str:
    """Generate a valid Flexport signature for testing.

    Mirrors Flexport: HMAC-SHA256 over the raw body, hex, prefixed "sha256=".
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyFlexportWebhook:
    """Tests for the Flexport signature verification function."""

    secret = os.environ["FLEXPORT_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"type":"/shipment#created"}'
        signature = generate_flexport_signature(payload.decode(), self.secret)
        assert verify_flexport_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"type":"/shipment#created"}'
        assert verify_flexport_webhook(payload, "sha256=deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"type":"/shipment#created"}'
        assert verify_flexport_webhook(payload, None, self.secret) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"type":"/shipment#created","id":1}'
        signature = generate_flexport_signature(original.decode(), self.secret)
        tampered = b'{"type":"/shipment#created","id":999}'
        assert verify_flexport_webhook(tampered, signature, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"type":"/shipment#created"}'
        signature = generate_flexport_signature(payload.decode(), self.secret)
        assert verify_flexport_webhook(payload, signature, "wrong_secret") is False

    def test_header_without_prefix_returns_false(self):
        payload = b'{"type":"/shipment#created"}'
        bare = hmac.new(self.secret.encode(), payload, hashlib.sha256).hexdigest()
        assert verify_flexport_webhook(payload, bare, self.secret) is False


class TestFlexportWebhook:
    """Tests for the Flexport webhook endpoint."""

    secret = os.environ["FLEXPORT_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/flexport",
            content='{"type":"/shipment#created"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"type": "/shipment#created"})
        response = client.post(
            "/webhooks/flexport",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps({
            "type": "/shipment#created",
            "id": 123,
            "data": {"resource": {"id": 42}},
        })
        signature = generate_flexport_signature(payload, self.secret)
        response = client.post(
            "/webhooks/flexport",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_shipment_leg_departed(self):
        payload = json.dumps({
            "type": "/shipment_leg#departed",
            "id": 456,
            "data": {"location": {"place": {"name": "Port of Shanghai"}}, "shipment": {"id": 100}},
        })
        signature = generate_flexport_signature(payload, self.secret)
        response = client.post(
            "/webhooks/flexport",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_invoice_payment_made(self):
        payload = json.dumps({
            "type": "/invoice#invoice_payment_made",
            "id": 789,
            "data": {"resource": {"id": 5001}},
        })
        signature = generate_flexport_signature(payload, self.secret)
        response = client.post(
            "/webhooks/flexport",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200

    def test_unhandled_event_returns_200(self):
        payload = json.dumps({"type": "/container_load_result#created", "id": 999})
        signature = generate_flexport_signature(payload, self.secret)
        response = client.post(
            "/webhooks/flexport",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
