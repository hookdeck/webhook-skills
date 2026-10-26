import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_payt_signature

# The Payt secret is an opaque string shown once on the webhooks settings page: used as UTF-8 bytes
SECRET = "test_payt_secret_abc123"
HEADER = "x-payt-signature"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("PAYT_WEBHOOK_SECRET", SECRET)


client = TestClient(app)


def sign(body, secret: str = SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


DEBTOR = {"id": 1, "category": "Debtor category", "company_name": "Example B.V.", "name": "Noa Jacobs", "debtor_code": "2"}
INVOICE = {
    "id": 1,
    "resource_type": "invoice",
    "invoice_number": "2011-1",
    "amount_open": "1000",
    "currency_code": "EUR",
    "debtor": DEBTOR,
}


def wrap(event_name: str, context: dict) -> dict:
    return {"event": {"event_name": event_name, "context": context, "event_time": "2018-06-05T09:48:55.314159Z"}}


# Shaped like the examples in Payt's events documentation
EVENTS = {
    "invoice_created": wrap("invoice_created", INVOICE),
    "invoice_paid": wrap("invoice_paid", {**INVOICE, "amount_open": "0"}),
    "invoice_closed": wrap("invoice_closed", {**INVOICE, "amount_open": "0"}),
    "invoice_payment_created": wrap("invoice_payment_created", {
        "id": 3592191, "resource_type": "invoice_payment", "amount": "2.0", "book_amount": "2.0",
        "currency_code": "EUR", "invoice": INVOICE, "debtor": DEBTOR,
    }),
    "case_created": wrap("case_created", {
        "id": 1, "resource_type": "credit_case", "credit_case_number": "123 456 789",
        "currency_code": "EUR", "invoices": [INVOICE], "debtor": DEBTOR,
    }),
    "case_paid": wrap("case_paid", {
        "id": 1, "resource_type": "credit_case", "credit_case_number": "123 456 789",
        "invoices": [INVOICE], "debtor": DEBTOR,
    }),
    "bundled_reminder_sent": wrap("bundled_reminder_sent", {
        "id": 1, "resource_type": "bundled_reminder", "sent_as_format": "email",
        "invoices": [INVOICE], "debtor": DEBTOR,
    }),
    "payment_plan_created": wrap("payment_plan_created", {
        "id": 1, "resource_type": "payment_plan", "invoices": [INVOICE], "debtor": DEBTOR,
    }),
    "credit_limit_exceeded": wrap("credit_limit_exceeded", {
        "id": 730816, "resource_type": "debtor", "debtor_code": "2", "name": "Some name",
        "credit_limit_amount": 1100.0, "book_open_amount": 1798.0,
    }),
    "psp_transaction_successful": wrap("psp_transaction_successful", INVOICE),
    # Not handled explicitly: must still be acknowledged
    "label_added": wrap("label_added", INVOICE),
}


def post(raw, headers=None):
    return client.post(
        "/webhooks/payt",
        content=raw,
        headers={"content-type": "application/json", **(headers or {})},
    )


class TestVerifyPaytSignature:
    raw = b'{"event":{"event_name":"invoice_created"}}'

    def test_accepts_valid_lowercase_hex(self):
        assert verify_payt_signature(self.raw, sign(self.raw), SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_payt_signature(self.raw, sign(self.raw).upper(), SECRET)

    @pytest.mark.parametrize("sig", [
        None,
        "",
        "abcd",
        "z" * 64,
        " " + "a" * 64,
        "a" * 65,
        "sha256=" + "a" * 64,
    ])
    def test_rejects_malformed(self, sig):
        assert not verify_payt_signature(self.raw, sig, SECRET)

    def test_rejects_base64(self):
        b64 = base64.b64encode(hmac.new(SECRET.encode(), self.raw, hashlib.sha256).digest()).decode()
        assert not verify_payt_signature(self.raw, b64, SECRET)

    def test_rejects_other_secret(self):
        assert not verify_payt_signature(self.raw, sign(self.raw, "other"), SECRET)

    def test_rejects_missing_secret(self):
        assert not verify_payt_signature(self.raw, sign(self.raw), None)

    def test_rejects_non_ascii_header_without_raising(self):
        assert not verify_payt_signature(self.raw, "é" * 64, SECRET)


class TestWebhook:
    @pytest.mark.parametrize("name", list(EVENTS))
    def test_accepts_signed_event(self, name):
        raw = json.dumps(EVENTS[name])
        res = post(raw, {HEADER: sign(raw)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dispatches_on_event_name(self, capsys):
        raw = json.dumps(EVENTS["invoice_created"])
        post(raw, {HEADER: sign(raw)})
        assert "Invoice 2011-1 created for Noa Jacobs" in capsys.readouterr().out

    def test_logs_unhandled_events(self, capsys):
        raw = json.dumps(EVENTS["label_added"])
        post(raw, {HEADER: sign(raw)})
        assert "Unhandled Payt event: label_added" in capsys.readouterr().out

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = json.dumps(EVENTS["invoice_paid"])
        res = post(raw, {"content-type": "text/plain", HEADER: sign(raw)})
        assert res.status_code == 200

    def test_verifies_raw_body_not_reserialised(self):
        raw = '{ "event": { "event_name": "invoice_created",   "context": {} } }'
        assert post(raw, {HEADER: sign(raw)}).status_code == 200
        reserialised = json.dumps(json.loads(raw))
        assert post(raw, {HEADER: sign(reserialised)}).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(json.dumps(EVENTS["invoice_created"])).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(json.dumps(EVENTS["invoice_created"]), {HEADER: ""}).status_code == 401

    def test_rejects_other_secret(self):
        raw = json.dumps(EVENTS["invoice_created"])
        assert post(raw, {HEADER: sign(raw, "wrong")}).status_code == 401

    def test_rejects_tampered_body(self):
        raw = json.dumps(EVENTS["invoice_created"])
        assert post(raw.replace("1000", "1"), {HEADER: sign(raw)}).status_code == 401

    def test_rejects_malformed_signature(self):
        raw = json.dumps(EVENTS["invoice_created"])
        assert post(raw, {HEADER: "not-a-signature"}).status_code == 401
        assert post(raw, {HEADER: "sha256=" + sign(raw)}).status_code == 401

    def test_400_for_signed_non_json(self):
        assert post("not json", {HEADER: sign("not json")}).status_code == 400

    def test_400_when_event_name_missing(self):
        raw = json.dumps({"event": {"context": {}}})
        assert post(raw, {HEADER: sign(raw)}).status_code == 400
        flat = json.dumps({"event_name": "invoice_created"})
        assert post(flat, {HEADER: sign(flat)}).status_code == 400

    def test_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("PAYT_WEBHOOK_SECRET", raising=False)
        raw = json.dumps(EVENTS["invoice_created"])
        assert post(raw, {HEADER: sign(raw)}).status_code == 500
