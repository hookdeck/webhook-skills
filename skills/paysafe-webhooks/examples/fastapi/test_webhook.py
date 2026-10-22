import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test-secret-key"  # Paysafe HMAC keys are used as raw UTF-8 strings
os.environ["PAYSAFE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_paysafe_webhook  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def make_event(event_name: str) -> bytes:
    # Pretty-printed: the signature covers the exact bytes received
    return json.dumps(
        {
            "payload": {"id": "a49ba790-9cc5-4502-9f4a-dccc72460cf1", "status": "COMPLETED"},
            "attemptNumber": 1,
            "type": "PAYMENT_HANDLE",
            "resourceId": "a49ba790-9cc5-4502-9f4a-dccc72460cf1",
            "links": [{"rel": "payment_handle", "href": "https://api.paysafe.com/paymenthub/v1/paymenthandles/a49ba790"}],
            "eventDate": "2026-01-15T10:00:00Z",
            "eventName": event_name,
        },
        indent=2,
    ).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["Signature"] = signature
    return client.post("/webhooks/paysafe", content=body, headers=headers)


class TestVerify:
    body = make_event("PAYMENT_HANDLE_COMPLETED")

    def test_valid(self):
        assert verify_paysafe_webhook(self.body, sign(self.body), SECRET)

    def test_invalid_variants(self):
        assert not verify_paysafe_webhook(self.body, sign(self.body, "other"), SECRET)
        assert not verify_paysafe_webhook(self.body + b" ", sign(self.body), SECRET)
        assert not verify_paysafe_webhook(self.body, "short", SECRET)
        assert not verify_paysafe_webhook(self.body, None, SECRET)


class TestWebhook:
    @pytest.mark.parametrize(
        "event_name",
        [
            "PAYMENT_HANDLE_COMPLETED",
            "PAYMENT_HANDLE_FAILED",
            "PAYMENT_COMPLETED",
            "SETTLEMENT_COMPLETED",
            "SOMETHING_NEW",
        ],
    )
    def test_valid_events(self, event_name):
        body = make_event(event_name)
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = make_event("PAYMENT_COMPLETED")
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_invalid_signature(self):
        body = make_event("PAYMENT_COMPLETED")
        assert post(body, sign(body, "wrong-key")).status_code == 400

    def test_missing_signature(self):
        assert post(make_event("PAYMENT_COMPLETED")).status_code == 400

    def test_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
