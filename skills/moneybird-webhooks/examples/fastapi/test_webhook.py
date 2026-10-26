import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Moneybird's webhook secret is an opaque string used as-is; this one is only for tests
SECRET = "test_moneybird_secret_8f3a1c"
os.environ["MONEYBIRD_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def digest(body: str, timestamp: int, secret=SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={digest(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        # Encode explicitly so a non-ASCII header value reaches the app as raw bytes
        headers["Moneybird-Signature"] = signature.encode("utf-8")
    return client.post("/webhooks/moneybird", content=body, headers=headers)


INVOICE_PAID = json.dumps({
    "administration_id": "116015326147118082",
    "webhook_id": "116010948233266179",
    "webhook_token": "hPCNhskk1PwGC1pyJZMZmKNT",
    "entity_type": "SalesInvoice",
    "entity_id": "116015245643744263",
    "state": "paid",
    "action": "sales_invoice_state_changed_to_paid",
    "entity": {"id": "116015245643744263", "state": "paid", "currency": "EUR"},
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(INVOICE_PAID, sign(INVOICE_PAID))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(INVOICE_PAID, sign(INVOICE_PAID), "text/plain").status_code == 200

    def test_accepts_space_after_comma(self):
        ts = int(time.time())
        assert post(INVOICE_PAID, f"t={ts}, v1={digest(INVOICE_PAID, ts)}").status_code == 200

    def test_accepts_uppercase_hex(self):
        ts = int(time.time())
        assert post(INVOICE_PAID, f"t={ts},v1={digest(INVOICE_PAID, ts).upper()}").status_code == 200

    def test_accepts_when_any_v1_matches(self):
        ts = int(time.time())
        good = digest(INVOICE_PAID, ts)
        old = digest(INVOICE_PAID, ts, "previous_secret")
        assert post(INVOICE_PAID, f"t={ts},v1={old},v1={good}").status_code == 200
        assert post(INVOICE_PAID, f"t={ts},v1={good},v1={old}").status_code == 200

    def test_ignores_unknown_schemes(self):
        ts = int(time.time())
        good = digest(INVOICE_PAID, ts)
        assert post(INVOICE_PAID, f"t={ts},v2={'a' * 64},v1={good}").status_code == 200
        assert post(INVOICE_PAID, f"t={ts},v2={good}").status_code == 400

    def test_rejects_missing_header(self):
        assert post(INVOICE_PAID).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(INVOICE_PAID.replace("paid", "late"), sign(INVOICE_PAID)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(INVOICE_PAID, sign(INVOICE_PAID, secret="other_secret")).status_code == 400

    def test_rejects_when_every_v1_is_wrong(self):
        ts = int(time.time())
        header = f"t={ts},v1={digest(INVOICE_PAID, ts, 'a')},v1={digest(INVOICE_PAID, ts, 'b')}"
        assert post(INVOICE_PAID, header).status_code == 400

    def test_rejects_bad_length_or_non_hex_v1(self):
        ts = int(time.time())
        good = digest(INVOICE_PAID, ts)
        assert post(INVOICE_PAID, f"t={ts},v1=abc").status_code == 400
        assert post(INVOICE_PAID, f"t={ts},v1={good}00").status_code == 400
        assert post(INVOICE_PAID, f"t={ts},v1=zz{good[2:]}").status_code == 400
        assert post(INVOICE_PAID, f"t={ts},v1=").status_code == 400

    def test_non_ascii_header_is_400_not_500(self):
        ts = int(time.time())
        assert post(INVOICE_PAID, f"t={ts},v1={'é' * 64}").status_code == 400

    def test_rejects_malformed_header(self):
        ts = int(time.time())
        assert post(INVOICE_PAID, "garbage").status_code == 400
        assert post(INVOICE_PAID, "t=abc,v1=deadbeef").status_code == 400
        assert post(INVOICE_PAID, f"v1={digest(INVOICE_PAID, ts)}").status_code == 400  # no t
        assert post(INVOICE_PAID, f"t={ts}").status_code == 400  # no v1

    def test_rejects_altered_timestamp(self):
        header = sign(INVOICE_PAID, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(INVOICE_PAID, header).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        # Retries and replays (including Hookdeck's) keep the original timestamp
        old = int(time.time()) - 3600
        assert post(INVOICE_PAID, sign(INVOICE_PAID, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(INVOICE_PAID, sign(INVOICE_PAID, old)).status_code == 400
        assert post(INVOICE_PAID, sign(INVOICE_PAID)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(INVOICE_PAID, sign(INVOICE_PAID, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("action", [
        "sales_invoice_created",
        "sales_invoice_state_changed_to_paid",
        "sales_invoice_state_changed_to_late",
        "contact_created",
        "contact_changed",
        "payment_registered",
        "estimate_created",
    ])
    def test_dispatch(self, caplog, action):
        body = json.dumps({
            "administration_id": "1", "webhook_id": "2", "entity_type": "X", "entity_id": "3",
            "state": "open", "action": action, "entity": {"id": "3", "company_name": "Foobar Holding B.V."},
        })
        with caplog.at_level(logging.INFO, logger="moneybird-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        if action == "estimate_created":
            assert "Unhandled action: estimate_created" in caplog.text
        else:
            assert "Unhandled" not in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400
