# Generated with: paypercut-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Paypercut webhook receiver.

Signed exactly as Paypercut signs: hex HMAC-SHA256(secret, f"{t}.{raw body}").
"""

import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "whsec_paypercut_test_secret_Key-123"
os.environ["PAYPERCUT_WEBHOOK_SECRET"] = SECRET

from main import app, verify_paypercut_signature  # noqa: E402

URL = "/webhooks/paypercut"
client = TestClient(app)
PAYMENT = json.dumps({"type": "payment.succeeded", "data": {"id": "pay_123", "amount": 1000}}).encode()


def sign(body: bytes, t: str = None, secret: str = SECRET):
    t = t if t is not None else str(int(time.time()))
    v1 = hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()
    return {"t": t, "v1": v1, "header": f"t={t},v1={v1}"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PAYPERCUT_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def post(body: bytes, sig: str = None, headers: dict = None, method: str = "POST"):
    h = {"content-type": "application/json", **(headers or {})}
    if sig is not None:
        h["paypercut-signature"] = sig
    return client.request(method, URL, content=body, headers=h)


class TestVerifyPaypercutSignature:
    def test_accepts_valid_and_uppercase_hex(self):
        s = sign(PAYMENT)
        assert verify_paypercut_signature(PAYMENT, s["header"], SECRET, 0)
        assert verify_paypercut_signature(PAYMENT, s["header"].replace(s["v1"], s["v1"].upper()), SECRET, 0)

    def test_accepts_when_any_v1_matches_and_ignores_other_keys(self):
        s = sign(PAYMENT)
        header = f"t={s['t']},v1={'a' * 64},v0=zzz,v1={s['v1']}"
        assert verify_paypercut_signature(PAYMENT, header, SECRET, 0)

    def test_uses_t_exactly_as_sent(self):
        assert verify_paypercut_signature(PAYMENT, sign(PAYMENT, "0001768991448")["header"], SECRET, 0)

    def test_rejects_bad_input(self):
        s = sign(PAYMENT)
        t, v1 = s["t"], s["v1"]
        assert not verify_paypercut_signature(PAYMENT + b" ", s["header"], SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, s["header"], "other", 0)
        assert not verify_paypercut_signature(PAYMENT, f"v1={v1}", SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, f"t=,v1={v1}", SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, f"t={t}", SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, f"t={t},v1={v1}00", SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, f"t={t},v1={v1[:62]}zz", SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, None, SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, "", SECRET, 0)

    def test_tolerance_only_when_set(self):
        old = sign(PAYMENT, str(int(time.time()) - 3600))
        assert verify_paypercut_signature(PAYMENT, old["header"], SECRET, 0)
        assert not verify_paypercut_signature(PAYMENT, old["header"], SECRET, 300)
        assert verify_paypercut_signature(PAYMENT, sign(PAYMENT)["header"], SECRET, 300)


class TestWebhookEndpoint:
    def test_accepts_signed_event(self):
        res = post(PAYMENT, sign(PAYMENT)["header"])
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type_and_exact_bytes(self):
        odd = b'{"type":"payout.paid",  "data":{"id":"po_1"}}\n'
        res = post(odd, sign(odd)["header"], headers={"content-type": "text/plain"})
        assert res.status_code == 200

    def test_unknown_event_is_acknowledged(self):
        body = json.dumps({"type": "person.created", "data": {"id": "p_1"}}).encode()
        assert post(body, sign(body)["header"]).status_code == 200

    def test_missing_malformed_or_mismatched_signature_is_401(self):
        assert post(PAYMENT).status_code == 401
        assert post(PAYMENT, "garbage").status_code == 401
        assert post(PAYMENT, sign(PAYMENT, secret="wrong-secret")["header"]).status_code == 401
        assert post(PAYMENT, sign(PAYMENT + b"x")["header"]).status_code == 401

    @pytest.mark.parametrize("body", [b"not json", b'{"data":{}}', b"[]"])
    def test_verified_non_event_is_400(self, body):
        assert post(body, sign(body)["header"]).status_code == 400

    def test_dedupes_on_delivery_id(self):
        h = {"paypercut-delivery-id": "del_dedupe_1"}
        assert "duplicate" not in post(PAYMENT, sign(PAYMENT)["header"], h).json()
        assert post(PAYMENT, sign(PAYMENT)["header"], h).json()["duplicate"] is True

    def test_old_timestamp_rejected_only_with_tolerance(self, monkeypatch):
        old = sign(PAYMENT, str(int(time.time()) - 3600))["header"]
        assert post(PAYMENT, old).status_code == 200
        monkeypatch.setenv("PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(PAYMENT, old).status_code == 401

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("PAYPERCUT_WEBHOOK_SECRET")
        assert post(PAYMENT, sign(PAYMENT)["header"]).status_code == 500


class TestOtherMethods:
    def test_signed_bodyless_get_is_acknowledged(self):
        res = client.get(URL, headers={"paypercut-signature": sign(b"")["header"]})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unsigned_get_is_401(self):
        assert client.get(URL).status_code == 401

    @pytest.mark.parametrize("method", ["PUT", "PATCH"])
    def test_signed_put_and_patch_with_body(self, method):
        assert post(PAYMENT, sign(PAYMENT)["header"], method=method).status_code == 200

    def test_signed_bodyless_delete(self):
        res = client.delete(URL, headers={"paypercut-signature": sign(b"")["header"]})
        assert res.status_code == 200
