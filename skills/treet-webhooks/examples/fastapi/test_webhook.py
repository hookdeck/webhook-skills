# Generated with: treet-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Treet webhook receiver.

Signatures are built exactly as Treet builds them: base64(HMAC-SHA256(secret, raw body)).
"""

import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_treet_signature

SECRET = "treet_test_secret_key"  # used as UTF-8 bytes, not decoded
URL = "/webhooks/treet"
JSON_HEADERS = {"content-type": "application/json"}

# Payload as shown in Treet's docs (shipping label payload)
LABEL_UPDATED = {
    "topic": "label",
    "trigger": "label/updated",
    "shopId": "boyish",
    "bundleId": "12345678-1234-1234-1234-123456789105",
    "bundleType": "TRADE_IN",
    "carrier": "USPS",
    "trackingNumber": "28735625627856237856287",
    "status": "SHIPPED",
    "updatedAt": "2024-01-01T12:00:00+00:00",
    "items": [{"id": "11345678-1234-1234-1234-123456789101", "sku": "large-pink-shirt"}],
}
BODY = json.dumps(LABEL_UPDATED).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("TREET_WEBHOOK_SECRET", SECRET)


client = TestClient(app)


def post(body: bytes, sig=None, headers=None):
    h = dict(headers or JSON_HEADERS)
    if sig is not None:
        h["x-treet-signature"] = sig
    return client.post(URL, content=body, headers=h)


class TestVerify:
    def test_valid_signature_and_exact_bytes(self):
        assert verify_treet_signature(BODY, sign(BODY), SECRET)
        body = '{ "title": "Café" }\n'.encode()
        assert verify_treet_signature(body, sign(body), SECRET)
        assert not verify_treet_signature('{"title":"Café"}'.encode(), sign(body), SECRET)

    def test_empty_body(self):
        assert verify_treet_signature(b"", sign(b""), SECRET)

    def test_rejects_bad_values(self):
        assert not verify_treet_signature(BODY, sign(BODY, "other"), SECRET)
        assert not verify_treet_signature(BODY + b" ", sign(BODY), SECRET)
        assert not verify_treet_signature(BODY, None, SECRET)
        assert not verify_treet_signature(BODY, "", SECRET)
        assert not verify_treet_signature(BODY, "sha256=" + sign(BODY), SECRET)
        assert not verify_treet_signature(BODY, sign(BODY)[:-1], SECRET)
        assert not verify_treet_signature(BODY, "é" * 44, SECRET)

    def test_rejects_stray_bits_in_last_character(self):
        sig = sign(BODY)
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        tweaked = sig[:42] + alphabet[(alphabet.index(sig[42]) + 1) % 64] + "="
        # Same decoded bytes, but Hookdeck compares the exact string, so this must fail.
        assert base64.b64decode(tweaked, validate=True) == base64.b64decode(sig, validate=True)
        assert not verify_treet_signature(BODY, tweaked, SECRET)

    def test_never_accepts_without_secret(self):
        assert not verify_treet_signature(BODY, sign(BODY, ""), "")
        assert not verify_treet_signature(BODY, sign(BODY), None)


class TestPost:
    def test_accepts_known_and_unknown_triggers(self):
        for payload in (
            LABEL_UPDATED,
            {**LABEL_UPDATED, "trigger": "label/created"},
            {"topic": "label", "trigger": "label/other"},
        ):
            body = json.dumps(payload).encode()
            assert post(body, sign(body)).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(BODY, sign(BODY), {"content-type": "text/plain"}).status_code == 200

    def test_rejects_missing_malformed_or_wrong_signature(self):
        assert post(BODY).status_code == 401
        assert post(BODY, "").status_code == 401
        assert post(BODY, "nope").status_code == 401
        assert post(BODY, sign(BODY, "other")).status_code == 401

    def test_bad_body_after_valid_signature_is_400(self):
        for body in (b"not json", b"[1]", b"\xff\xfe"):
            assert post(body, sign(body)).status_code == 400

    def test_wrong_typed_fields_do_not_crash(self):
        body = json.dumps({"trigger": {"x": 1}, "items": "nope", "bundleId": 5}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_unconfigured_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("TREET_WEBHOOK_SECRET")
        assert post(BODY, sign(BODY)).status_code == 500


class TestOtherMethods:
    def test_bodyless_get_verified_over_zero_bytes(self):
        assert client.get(URL, headers={"x-treet-signature": sign(b"")}).status_code == 200
        assert client.get(URL).status_code == 401

    @pytest.mark.parametrize("method", ["put", "patch", "delete"])
    def test_signed_with_body(self, method):
        res = client.request(
            method.upper(), URL, content=BODY, headers={**JSON_HEADERS, "x-treet-signature": sign(BODY)}
        )
        assert res.status_code == 200
