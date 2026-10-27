import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# OxaPay signs with the merchant API key (payments) or payout API key (payouts)
SECRET = "OXAPAY_TEST_MERCHANT_API_KEY"
os.environ["OXAPAY_WEBHOOK_SECRET"] = SECRET

from main import app, verify_oxapay_signature  # noqa: E402

client = TestClient(app)


def sign(body, secret=SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


PAID_PAYMENT = json.dumps({
    "track_id": "151811887",
    "status": "Paid",
    "type": "invoice",
    "module_name": "OxaPay",
    "amount": 10,
    "currency": "POL",
    "order_id": "ORD-12345",
    "date": 1738493900,
    "txs": [{"status": "confirmed", "tx_hash": "x", "network": "Polygon Network"}],
})


def payout_body(status: str) -> str:
    return json.dumps({
        "track_id": "227296189",
        "status": status,
        "type": "payout",
        "tx_hash": "x",
        "address": "x",
        "amount": 10.0,
        "currency": "POL",
        "network": "Polygon Network",
        "date": 1738492316,
    })


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["HMAC"] = signature
    return client.post("/webhooks/oxapay", content=body.encode(), headers=headers)


class TestVerifyOxapaySignature:
    body = PAID_PAYMENT.encode()

    def test_accepts_valid_and_uppercase_signature(self):
        assert verify_oxapay_signature(self.body, sign(self.body), SECRET)
        assert verify_oxapay_signature(self.body, sign(self.body).upper(), SECRET)

    def test_rejects_wrong_secret_tampered_body_and_missing_inputs(self):
        assert not verify_oxapay_signature(self.body, sign(self.body, "other"), SECRET)
        assert not verify_oxapay_signature(self.body + b" ", sign(self.body), SECRET)
        assert not verify_oxapay_signature(self.body, None, SECRET)
        assert not verify_oxapay_signature(self.body, "", SECRET)
        assert not verify_oxapay_signature(self.body, sign(self.body), None)

    def test_rejects_malformed_signatures(self):
        good = sign(self.body)
        assert not verify_oxapay_signature(self.body, good[:126], SECRET)
        assert not verify_oxapay_signature(self.body, good + "00", SECRET)
        assert not verify_oxapay_signature(self.body, "zz" + good[2:], SECRET)
        assert not verify_oxapay_signature(self.body, "sha512=" + good, SECRET)
        assert not verify_oxapay_signature(self.body, good + "\n", SECRET)


class TestWebhookEndpoint:
    def test_verified_payment_gets_200_and_ok_body(self, capsys):
        res = post(PAID_PAYMENT, sign(PAID_PAYMENT))
        assert res.status_code == 200
        assert res.text == "ok"
        assert "paid" in capsys.readouterr().out

    @pytest.mark.parametrize("status", ["Confirming", "Confirmed", "Failed"])
    def test_handles_payout_statuses(self, status, capsys):
        body = payout_body(status)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.text == "ok"
        assert f"Payout 227296189 {status.lower()}" in capsys.readouterr().out

    def test_handles_paying(self, capsys):
        body = json.dumps({"track_id": "1", "status": "Paying", "type": "invoice"})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert "paying" in capsys.readouterr().out

    def test_acknowledges_unknown_status(self, capsys):
        body = json.dumps({"track_id": "1", "status": "Expired", "type": "invoice"})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert "Unhandled OxaPay status: Expired" in capsys.readouterr().out

    def test_any_content_type(self):
        assert post(PAID_PAYMENT, sign(PAID_PAYMENT), "text/plain").status_code == 200

    def test_verifies_exact_bytes_not_reserialised_json(self):
        spaced = '{ "track_id": "1",  "status": "Paid", "type": "invoice" }'
        assert post(spaced, sign(spaced)).status_code == 200

    def test_401_for_missing_empty_malformed_or_wrong_signature(self):
        assert post(PAID_PAYMENT).status_code == 401
        assert post(PAID_PAYMENT, "").status_code == 401
        assert post(PAID_PAYMENT, "not-hex").status_code == 401
        assert post(PAID_PAYMENT, sign(PAID_PAYMENT, "wrong")).status_code == 401

    def test_401_when_body_modified_after_signing(self):
        assert post(PAID_PAYMENT.replace("Paid", "Paying"), sign(PAID_PAYMENT)).status_code == 401

    def test_400_for_signed_non_json_body(self):
        assert post("not json", sign("not json")).status_code == 400
