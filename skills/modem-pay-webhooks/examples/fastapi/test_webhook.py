import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# Test-only secret. Modem Pay secrets are used as plain strings, exactly as the dashboard shows them.
SECRET = "test_modem_pay_webhook_secret_8f2c1d"
os.environ["MODEM_PAY_WEBHOOK_SECRET"] = SECRET

from main import app, verify_modem_pay  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch, caplog):
    monkeypatch.setenv("MODEM_PAY_WEBHOOK_SECRET", SECRET)
    caplog.set_level(logging.INFO, logger="modem-pay-webhooks")


def sign(body, secret=SECRET) -> str:
    """x-modem-signature = HMAC-SHA512 hex of the raw body (as Hookdeck's Modem Pay source checks it)."""
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


def post(body, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-modem-signature"] = signature
    return client.post("/webhooks/modem-pay", content=body, headers=headers)


def event(name="charge.succeeded", **payload) -> str:
    """Trimmed from the sample event on Modem Pay's webhooks page (customer details replaced)."""
    base = {
        "id": "23419194-7324-4c2b-a74b-d8fba736e692",
        "type": "payment",
        "amount": 2500,
        "currency": "GMD",
        "payment_method": "qmoney",
        "status": "completed",
        "test_mode": True,
        "transaction_reference": "VOAO1CFEN7",
    }
    base.update(payload)
    return json.dumps({"event": name, "payload": base}, separators=(",", ":"))


class TestVerifyModemPay:
    body = event().encode()

    def test_accepts_valid_signature(self):
        assert verify_modem_pay(self.body, sign(self.body), SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_modem_pay(self.body, sign(self.body).upper(), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_modem_pay(self.body, sign(self.body, "other_secret"), SECRET)

    def test_rejects_tampered_body(self):
        assert not verify_modem_pay(event(amount=1).encode(), sign(self.body), SECRET)

    @pytest.mark.parametrize(
        "sig",
        [
            "",
            sign(event())[:127],
            sign(event()) + "0",
            "z" * 128,
            "sha512=" + sign(event()),
            "a" * 64,
            "é" * 128,
        ],
        ids=["empty", "short", "long", "non-hex", "prefixed", "sha256-length", "non-ascii"],
    )
    def test_rejects_malformed_signature_without_raising(self, sig):
        assert not verify_modem_pay(self.body, sig, SECRET)

    def test_rejects_missing_header_or_secret(self):
        assert not verify_modem_pay(self.body, None, SECRET)
        assert not verify_modem_pay(self.body, sign(self.body), "")


class TestWebhookEndpoint:
    def test_valid_charge_succeeded(self, caplog):
        body = event()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Charge succeeded: 23419194" in caplog.text

    @pytest.mark.parametrize(
        "name",
        ["charge.updated", "payment_intent.created", "customer.created", "transfer.succeeded", "transfer.failed"],
    )
    def test_handles_events(self, name):
        body = event(name)
        assert post(body, sign(body)).status_code == 200

    def test_acknowledges_unknown_events(self, caplog):
        body = event("charge.expired")
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled Modem Pay event: charge.expired" in caplog.text

    def test_verifies_raw_bytes_not_reserialised_json(self):
        body = '{ "payload": {"id": "x", "amount": 10},\n  "event": "charge.succeeded" }'
        assert post(body, sign(body)).status_code == 200

    def test_accepts_any_content_type(self):
        body = event()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_missing_signature_is_401(self):
        assert post(event()).status_code == 401

    def test_tampered_body_is_401(self):
        assert post(event(amount=999999), sign(event())).status_code == 401

    def test_wrong_secret_is_401(self):
        body = event()
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_non_ascii_signature_header_is_401(self):
        # Raw latin-1 bytes in the header must not raise
        body = event().encode()
        res = client.post(
            "/webhooks/modem-pay",
            content=body,
            headers=[(b"content-type", b"application/json"), (b"x-modem-signature", b"\xe9" * 128)],
        )
        assert res.status_code == 401

    def test_signed_non_json_is_400(self):
        body = "not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_signed_invalid_utf8_is_400(self):
        body = b"\xff\xfe"
        assert post(body, sign(body), "application/octet-stream").status_code == 400

    @pytest.mark.parametrize(
        "body",
        [
            "[]",
            '"charge.succeeded"',
            "null",
            '{"event": 1, "payload": {}}',
            '{"event": "charge.succeeded", "payload": "x"}',
            '{"event": "charge.succeeded", "payload": []}',
            '{"event": "charge.succeeded"}',
        ],
    )
    def test_wrong_shaped_signed_body_is_400(self, body):
        assert post(body, sign(body)).status_code == 400

    def test_tolerates_wrong_typed_payload_fields(self):
        body = json.dumps({"event": "charge.succeeded", "payload": {"id": 7, "currency": []}})
        assert post(body, sign(body)).status_code == 200

    def test_missing_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("MODEM_PAY_WEBHOOK_SECRET")
        body = event()
        assert post(body, sign(body)).status_code == 500
