import hashlib
import hmac
import json
import os

# Check keys are 40 hex characters but are used as plain UTF-8 text
KEY = "4f541ff5350323b6ba6ca4e96873e6f4cb9fd144"
os.environ["CHECK_WEBHOOK_KEY"] = KEY

import base64  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_check_webhook  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = KEY) -> str:
    """Same algorithm as Check: hex HMAC-SHA256 of the raw body, key as UTF-8 text."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body, topic="payroll", signature="auto", content_type="application/json"):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    headers = {
        "content-type": content_type,
        "check-topic": topic,
        "check-webhookevent-id": "whe_test123",
        "check-live": "false",
    }
    if signature == "auto":
        headers["check-signature"] = sign(raw)
    elif signature is not None:
        headers["check-signature"] = signature
    return client.post("/webhooks/check-hq", content=raw, headers=headers)


class TestVerifyCheckWebhook:
    body = b'{"event":"updated","data":{}}'

    def test_valid_signature(self):
        assert verify_check_webhook(self.body, sign(self.body), KEY)

    def test_uppercase_signature(self):
        assert verify_check_webhook(self.body, sign(self.body).upper(), KEY)

    def test_rejects_hex_decoded_key(self):
        wrong = hmac.new(bytes.fromhex(KEY), self.body, hashlib.sha256).hexdigest()
        assert not verify_check_webhook(self.body, wrong, KEY)

    def test_rejects_base64_signature(self):
        digest = hmac.new(KEY.encode(), self.body, hashlib.sha256).digest()
        assert not verify_check_webhook(self.body, base64.b64encode(digest).decode(), KEY)

    def test_rejects_wrong_or_missing(self):
        assert not verify_check_webhook(self.body, "deadbeef", KEY)
        assert not verify_check_webhook(self.body, None, KEY)


class TestWebhookEndpoint:
    def test_missing_signature(self):
        res = post({"event": "updated", "data": {"id": "pay_1"}}, signature=None)
        assert res.status_code == 400

    def test_invalid_signature(self):
        res = post({"event": "updated", "data": {"id": "pay_1"}}, signature="a" * 64)
        assert res.status_code == 400

    def test_modified_body(self):
        sig = sign(json.dumps({"event": "updated", "data": {"id": "pay_1"}}).encode())
        res = post({"event": "updated", "data": {"id": "pay_2"}}, signature=sig)
        assert res.status_code == 400

    def test_payroll_updated(self):
        res = post({"event": "updated", "data": {"id": "pay_Z26PNMC7Ky1wfFQzVqfF", "status": "paid"}})
        assert res.status_code == 200

    def test_payment_status_change(self):
        res = post(
            {"event": "status_change", "data": {"id": "pyt_vIFHhvyGN47ej1upyIT8", "status": "paid"}},
            topic="payment",
        )
        assert res.status_code == 200

    def test_employee_created(self):
        res = post({"event": "created", "data": {"id": "emp_zGGp6wYcxAeu1Ng8IA7v"}}, topic="employee")
        assert res.status_code == 200

    def test_any_content_type(self):
        res = post({"event": "created", "data": {"id": "emp_1"}}, topic="employee", content_type="text/plain")
        assert res.status_code == 200

    def test_ping(self):
        res = post({"message": "Test webhook"}, topic="ping")
        assert res.status_code == 200

    def test_unhandled_event(self):
        res = post({"event": "created", "data": {"id": "doc_1"}}, topic="employee_tax_document")
        assert res.status_code == 200

    def test_invalid_json(self):
        res = post(b"not json")
        assert res.status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
