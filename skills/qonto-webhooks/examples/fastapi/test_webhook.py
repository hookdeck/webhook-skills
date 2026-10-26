import hashlib
import hmac
import json
import logging
import time

import pytest
from fastapi.testclient import TestClient

from main import app, handle_qonto_event, verify_qonto_signature

SECRET = "whsec_VuvcYxzMbryt1UBytq58jtGBxCgbQdzX/c0vj5ZLjUA="

client = TestClient(app)


def sign(body, t: str, secret: str = SECRET) -> str:
    """Qonto: lowercase hex HMAC-SHA256(key = secret UTF-8 bytes, message = `<t>.<raw body>`)."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), t.encode() + b"." + body, hashlib.sha256).hexdigest()


def header(body, t: str = "1704110400", secret: str = SECRET) -> str:
    return f"t={t},v1={sign(body, t, secret)}"


# Payloads trimmed from the sample bodies in Qonto's docs (one per handled type).
TRANSACTION = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "subscription_id": "123e4567-e89b-12d3-a456-426614174000",
    "organization_id": "123e4567-e89b-12d3-a456-426614174000",
    "membership_id": "123e4567-e89b-12d3-a456-426614174000",
    "type": "v1/transactions",
    "created_at": "2025-01-24T10:55:00Z",
    "data": {
        "event": "created", "id": "123e4567-e89b-12d3-a456-426614174000", "amount": 50.01,
        "currency": "EUR", "side": "debit", "operation_type": "transfer", "status": "completed",
        "label": "ACME Corp", "bank_account_id": "123e4567-e89b-12d3-a456-426614174000",
    },
}
CARD = {
    **TRANSACTION, "type": "v1/cards",
    "data": {"event": "created", "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "nickname": "💳 for 🍗",
             "status": "pending", "masked_pan": "511768******7662", "card_type": "debit"},
}
TRANSFER = {
    **TRANSACTION, "type": "v1/transfers", "created_at": "2025-04-22T12:00:00Z",
    "data": {"event": "created", "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08", "amount": 1100.5,
             "amount_currency": "EUR", "status": "pending", "reference": "Lease payment"},
}


def dumps(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def post(body, sig=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if sig is not None:
        headers["X-Qonto-Signature"] = sig
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/qonto", content=content, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("QONTO_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("QONTO_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestPublishedVector:
    """Worked example from Qonto's docs."""

    SECRET = "test-secret"
    BODY = '{"test":"data"}'
    HEADER = "t=1704110400,v1=56aff06dc227db80d6568a5070f912c601c31f20451745d257cbc0b5dfa93805"

    def test_verifies(self):
        ok, _ = verify_qonto_signature(self.BODY.encode(), self.HEADER, self.SECRET)
        assert ok

    def test_rejects_changed_body(self):
        ok, _ = verify_qonto_signature(b'{"test": "data"}', self.HEADER, self.SECRET)
        assert not ok

    def test_end_to_end(self, monkeypatch):
        monkeypatch.setenv("QONTO_WEBHOOK_SECRET", self.SECRET)
        assert post(self.BODY, self.HEADER).status_code == 200


class TestVerify:
    body = dumps(TRANSACTION).encode()

    def test_valid(self):
        assert verify_qonto_signature(self.body, header(self.body), SECRET)[0]

    def test_whole_whsec_secret_is_a_plain_key(self):
        import base64

        stripped = SECRET[len("whsec_"):]
        bad1 = f"t=1704110400,v1={sign(self.body, '1704110400', stripped)}"
        decoded = base64.b64decode(stripped)
        bad2 = "t=1704110400,v1=" + hmac.new(decoded, b"1704110400." + self.body, hashlib.sha256).hexdigest()
        assert not verify_qonto_signature(self.body, bad1, SECRET)[0]
        assert not verify_qonto_signature(self.body, bad2, SECRET)[0]

    def test_uppercase_hex(self):
        h = f"t=1704110400,v1={sign(self.body, '1704110400').upper()}"
        assert verify_qonto_signature(self.body, h, SECRET)[0]

    def test_any_matching_v1_and_other_keys_ignored(self):
        good = sign(self.body, "1704110400")
        wrong = "a" * 64
        assert verify_qonto_signature(self.body, f"t=1704110400,v1={wrong},v1={good}", SECRET)[0]
        assert verify_qonto_signature(self.body, f"t=1704110400,v0={good},v1={good}", SECRET)[0]
        assert not verify_qonto_signature(self.body, f"t=1704110400,v0={good}", SECRET)[0]

    def test_t_is_used_exactly_as_sent(self):
        assert verify_qonto_signature(self.body, header(self.body, "01704110400"), SECRET)[0]
        h = f"t=1704110400,v1={sign(self.body, '01704110400')}"
        assert not verify_qonto_signature(self.body, h, SECRET)[0]

    def test_non_utf8_bytes(self):
        raw = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert verify_qonto_signature(raw, header(raw), SECRET)[0]
        assert not verify_qonto_signature(raw.decode("utf-8", "replace").encode(), header(raw), SECRET)[0]

    @pytest.mark.parametrize("h", [
        "",
        "v1=" + "a" * 64,
        "t=,v1=" + "a" * 64,
        "t=1704110400",
        "t=1704110400,v1=abcd",
        "t=1704110400,v1=" + "z" * 64,
        "not a signature",
    ])
    def test_rejects_bad_headers(self, h):
        assert not verify_qonto_signature(self.body, h, SECRET)[0]

    def test_timestamp_ignored_by_default_but_tolerance_is_opt_in(self):
        old = header(self.body, "1000000000")
        assert verify_qonto_signature(self.body, old, SECRET)[0]
        assert not verify_qonto_signature(self.body, old, SECRET, 300)[0]
        assert verify_qonto_signature(self.body, header(self.body, str(int(time.time()))), SECRET, 300)[0]


class TestEndpoint:
    @pytest.mark.parametrize("payload", [TRANSACTION, CARD, TRANSFER], ids=["transactions", "cards", "transfers"])
    def test_accepts_signed_events(self, payload):
        body = dumps(payload)
        res = post(body, header(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        body = dumps(TRANSACTION)
        assert post(body, header(body), "text/plain").status_code == 200

    def test_missing_header(self):
        assert post(dumps(TRANSACTION)).status_code == 401

    def test_wrong_secret(self):
        body = dumps(TRANSACTION)
        assert post(body, header(body, secret="another-secret-another-secret-123456")).status_code == 401

    def test_altered_body(self):
        body = dumps(TRANSACTION)
        assert post(body.replace("50.01", "5000.01"), header(body)).status_code == 401

    def test_signed_non_json(self):
        assert post("not json", header("not json")).status_code == 400

    def test_signed_json_non_object(self):
        assert post("[1]", header("[1]")).status_code == 400

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("QONTO_WEBHOOK_SECRET")
        body = dumps(TRANSACTION)
        assert post(body, header(body)).status_code == 500

    def test_tolerance_only_when_configured(self, monkeypatch):
        body = dumps(TRANSACTION)
        old = header(body, "1000000000")
        assert post(body, old).status_code == 200
        monkeypatch.setenv("QONTO_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(body, old).status_code == 401


class TestDispatch:
    def test_handled_types(self, caplog):
        with caplog.at_level(logging.INFO, logger="qonto"):
            handle_qonto_event(TRANSACTION)
            handle_qonto_event(CARD)
            handle_qonto_event(TRANSFER)
        msgs = [r.getMessage() for r in caplog.records]
        assert msgs[0].startswith("Transaction created")
        assert msgs[1].startswith("Card created")
        assert msgs[2].startswith("Transfer created")

    def test_unhandled_type_is_logged(self, caplog):
        with caplog.at_level(logging.INFO, logger="qonto"):
            handle_qonto_event({"type": "v1/accounts", "data": {"event": "created"}})
        assert caplog.records[0].getMessage() == "Unhandled Qonto event: v1/accounts created"
