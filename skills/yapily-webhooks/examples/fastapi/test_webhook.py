import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Secret returned once at webhook registration
os.environ["YAPILY_WEBHOOK_SECRET"] = "test_yapily_secret"

from main import app, verify_yapily_webhook

client = TestClient(app)
SECRET = os.environ["YAPILY_WEBHOOK_SECRET"]


def sign(payload: str, key: str = SECRET) -> str:
    """Yapily: lowercase hex HMAC-SHA256 of the raw body, key = secret as UTF-8."""
    return hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def make_event(event_type: str, event: dict = None) -> str:
    return json.dumps({
        "id": "41285f64-5717-4562-b3fc-2c961236afa6",
        "applicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "type": event_type,
        "event": event or {},
        "metadata": {"tracingId": "6cf5ef06-9f96-4f24-8bab-32ab09128010", "user": {"key": "value"}},
    })


def post(body: str, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/yapily",
        content=body,
        headers={"content-type": content_type, **headers},
    )


class TestVerifyYapilyWebhook:
    body = make_event("single_payment.status.completed", {"status": "COMPLETED"})

    def test_valid_signature(self):
        assert verify_yapily_webhook(self.body.encode(), [sign(self.body), None], SECRET)

    def test_uppercase_signature(self):
        assert verify_yapily_webhook(self.body.encode(), [sign(self.body).upper()], SECRET)

    def test_rotation_signature(self):
        assert verify_yapily_webhook(self.body.encode(), ["0" * 64, sign(self.body)], SECRET)

    def test_wrong_secret(self):
        assert not verify_yapily_webhook(self.body.encode(), [sign(self.body, "other")], SECRET)

    def test_tampered_body(self):
        assert not verify_yapily_webhook((self.body + " ").encode(), [sign(self.body)], SECRET)

    def test_wrong_length_signature(self):
        assert not verify_yapily_webhook(self.body.encode(), ["abc"], SECRET)

    def test_no_signatures(self):
        assert not verify_yapily_webhook(self.body.encode(), [None, None], SECRET)


class TestYapilyWebhookEndpoint:
    @pytest.mark.parametrize("event_type", [
        "single_payment.status.completed",
        "single_payment.status.updated",
        "single_payment.iso_status.updated",
        "hosted_pis.payment_status.completed.v1",
        "hosted_pis.payment_status.failed.v1",
    ])
    def test_accepts_event(self, event_type):
        body = make_event(event_type, {"status": "COMPLETED"})
        assert post(body, {"webhook-signature": sign(body)}).status_code == 200

    def test_any_content_type(self):
        body = make_event("single_payment.status.completed")
        assert post(body, {"webhook-signature": sign(body)}, "text/plain").status_code == 200

    def test_rotation_signature_only(self):
        body = make_event("single_payment.status.completed")
        headers = {"webhook-signature": "0" * 64, "webhook-rotation-signature": sign(body)}
        assert post(body, headers).status_code == 200

    def test_unknown_event_type(self):
        body = make_event("some.future.type")
        assert post(body, {"webhook-signature": sign(body)}).status_code == 200

    def test_invalid_signature(self):
        body = make_event("single_payment.status.completed")
        assert post(body, {"webhook-signature": "f" * 64}).status_code == 400

    def test_missing_signature(self):
        assert post(make_event("single_payment.status.completed"), {}).status_code == 400

    def test_signed_non_json(self):
        body = "not json"
        assert post(body, {"webhook-signature": sign(body)}, "text/plain").status_code == 400
