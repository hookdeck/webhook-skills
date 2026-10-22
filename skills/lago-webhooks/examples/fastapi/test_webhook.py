import base64
import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["LAGO_HMAC_KEY"] = "test_hmac_signature_token"

from main import app, verify_lago_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["LAGO_HMAC_KEY"]


def generate_lago_signature(payload: str, secret: str = SECRET) -> str:
    """Lago HMAC signature: base64 HMAC-SHA256 of the raw body."""
    digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def post(payload: str, headers: dict | None = None, content_type: str = "application/json"):
    all_headers = {"Content-Type": content_type, "X-Lago-Signature-Algorithm": "hmac", **(headers or {})}
    return client.post("/webhooks/lago", content=payload, headers=all_headers)


class TestVerifyLagoSignature:
    payload = '{"webhook_type":"invoice.created"}'

    def test_accepts_valid_signature(self):
        assert verify_lago_signature(self.payload.encode(), generate_lago_signature(self.payload), SECRET)

    def test_rejects_invalid_signature(self):
        assert not verify_lago_signature(self.payload.encode(), "invalid", SECRET)

    def test_rejects_missing_signature_or_secret(self):
        assert not verify_lago_signature(self.payload.encode(), None, SECRET)
        assert not verify_lago_signature(self.payload.encode(), generate_lago_signature(self.payload), None)

    def test_rejects_tampered_payload(self):
        signature = generate_lago_signature(self.payload)
        assert not verify_lago_signature(b'{"webhook_type":"invoice.voided"}', signature, SECRET)

    def test_rejects_wrong_key(self):
        assert not verify_lago_signature(self.payload.encode(), generate_lago_signature(self.payload, "other"), SECRET)


class TestWebhookEndpoint:
    def test_missing_signature_header(self):
        assert post("{}").status_code == 400

    def test_invalid_signature(self):
        response = post("{}", {"X-Lago-Signature": "invalid"})
        assert response.status_code == 400
        assert "Invalid signature" in response.text

    def test_jwt_algorithm_rejected(self):
        payload = json.dumps({"webhook_type": "invoice.created"})
        response = post(
            payload,
            {"X-Lago-Signature": generate_lago_signature(payload), "X-Lago-Signature-Algorithm": "jwt"},
        )
        assert response.status_code == 400

    def test_tampered_payload(self):
        original = json.dumps({"webhook_type": "invoice.created", "amount": 100})
        tampered = json.dumps({"webhook_type": "invoice.created", "amount": 999})
        assert post(tampered, {"X-Lago-Signature": generate_lago_signature(original)}).status_code == 400

    def test_valid_signature(self):
        payload = json.dumps(
            {
                "webhook_type": "invoice.created",
                "object_type": "invoice",
                "organization_id": "org_1",
                "invoice": {"lago_id": "inv_1"},
            }
        )
        response = post(
            payload,
            {"X-Lago-Signature": generate_lago_signature(payload), "X-Lago-Unique-Key": "key-1"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_any_content_type(self):
        payload = json.dumps({"webhook_type": "customer.created", "object_type": "customer", "customer": {}})
        response = post(payload, {"X-Lago-Signature": generate_lago_signature(payload)}, "text/plain")
        assert response.status_code == 200

    def test_handles_every_documented_event_type(self):
        events = [
            "invoice.created",
            "invoice.payment_status_updated",
            "subscription.started",
            "subscription.terminated",
            "customer.created",
            "wallet.depleted_ongoing_balance",
            "unknown.event.type",
        ]
        for webhook_type in events:
            payload = json.dumps(
                {"webhook_type": webhook_type, "object_type": "thing", "organization_id": "org_1", "thing": {}}
            )
            response = post(payload, {"X-Lago-Signature": generate_lago_signature(payload)})
            assert response.status_code == 200


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
