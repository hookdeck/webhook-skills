import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_violet_signature

# Violet app secrets are 32 hex characters, used as UTF-8 (never hex-decoded)
SECRET = "3c989fdb913d4dd99e832b08cf207102"
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

# Payloads based on the sample bodies in Violet's webhook docs
MERCHANT_ENABLED = {
    "id": 10189,
    "name": "sample-store",
    "platform": "SHOPIFY",
    "store_url": "sample-store.myshopify.com",
    "status": "ACTIVE",
    "default_currency": "USD",
    "connection_status": "CONNECTED",
}
TRANSFER_SENT = {
    "id": 335500,
    "payment_provider_id": "tr_3RBesbK29KDiBVld0zLcELFW",
    "payout_account_id": 11495,
    "amount": 11428,
    "currency": "USD",
    "status": "SENT",
    "payment_provider": "STRIPE",
    "related_orders": ["8035507"],
    "errors": [],
}
ORDER = {"id": 8035507, "status": "COMPLETED", "currency": "USD"}


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("VIOLET_WEBHOOK_SECRET", SECRET)


@pytest.fixture
def client():
    return TestClient(app)


def sign(body: bytes, key: str = SECRET) -> str:
    """Violet signs only the raw body bytes: base64(HMAC-SHA256(secret, body))."""
    return base64.b64encode(hmac.new(key.encode(), body, hashlib.sha256).digest()).decode()


def send(client, body, topic="ORDER_UPDATED", signature="auto", content_type="application/json"):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    headers = {"content-type": content_type}
    if topic is not None:
        headers["x-violet-topic"] = topic
    if signature == "auto":
        signature = sign(raw)
    if signature is not None:
        headers["x-violet-hmac"] = signature
    return client.post("/webhooks/violet", content=raw, headers=headers)


def with_stray_bits(signature: str) -> str:
    """The 43rd character carries 4 digest bits and 2 stray bits: change only the stray bits."""
    index = ALPHABET.index(signature[42])
    altered = ALPHABET[(index & ~3) | ((index + 1) & 3)]
    return signature[:42] + altered + "="


class TestValidEvents:
    def test_merchant_enabled(self, client, capsys):
        res = send(client, MERCHANT_ENABLED, topic="MERCHANT_ENABLED")
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert 'MERCHANT_ENABLED: merchant 10189 "sample-store" (ACTIVE)' in capsys.readouterr().out

    def test_transfer_sent(self, client, capsys):
        res = send(client, TRANSFER_SENT, topic="TRANSFER_SENT")
        assert res.status_code == 200
        assert "TRANSFER_SENT: transfer 335500 11428 USD (SENT)" in capsys.readouterr().out

    @pytest.mark.parametrize("topic", ["ORDER_COMPLETED", "ORDER_SHIPPED"])
    def test_order_events(self, client, topic, capsys):
        assert send(client, ORDER, topic=topic).status_code == 200
        assert f"{topic}: order 8035507 (COMPLETED)" in capsys.readouterr().out

    def test_verifies_exact_bytes_received(self, client):
        raw = '{\n  "id": 1,\n  "status":   "ACTIVE",  "note": "café ☃"\n}'.encode()
        assert send(client, raw).status_code == 200

    def test_accepts_any_content_type(self, client):
        assert send(client, ORDER, content_type="text/plain").status_code == 200

    def test_unhandled_topic_is_logged_and_accepted(self, client, capsys):
        res = send(client, {"id": 5}, topic="PRODUCT_SYNC_COMPLETED")
        assert res.status_code == 200
        assert "Unhandled Violet topic: PRODUCT_SYNC_COMPLETED" in capsys.readouterr().out


class TestSignatureRejection:
    def test_missing_signature(self, client):
        assert send(client, ORDER, signature=None).status_code == 401

    def test_empty_signature(self, client):
        assert send(client, ORDER, signature="").status_code == 401

    def test_wrong_secret(self, client):
        raw = json.dumps(ORDER).encode()
        assert send(client, raw, signature=sign(raw, "another-secret")).status_code == 401

    def test_tampered_body(self, client):
        raw = json.dumps(ORDER).encode()
        tampered = raw.replace(b"COMPLETED", b"FAILED")
        assert send(client, tampered, signature=sign(raw)).status_code == 401

    def test_secret_is_not_hex_decoded(self, client):
        raw = json.dumps(ORDER).encode()
        signature = base64.b64encode(
            hmac.new(bytes.fromhex(SECRET), raw, hashlib.sha256).digest()
        ).decode()
        assert send(client, raw, signature=signature).status_code == 401

    def test_hex_digest_and_prefixed_value(self, client):
        raw = json.dumps(ORDER).encode()
        hex_digest = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        assert send(client, raw, signature=hex_digest).status_code == 401
        assert send(client, raw, signature=f"sha256={sign(raw)}").status_code == 401

    def test_unpadded_or_trailing_junk(self, client):
        raw = json.dumps(ORDER).encode()
        good = sign(raw)
        assert send(client, raw, signature=good[:-1]).status_code == 401
        assert send(client, raw, signature=good + "x").status_code == 401

    def test_stray_low_bits_are_rejected(self, client):
        raw = json.dumps(ORDER).encode()
        good = sign(raw)
        stray = with_stray_bits(good)
        # It decodes to the same digest bytes...
        assert base64.b64decode(stray, validate=True) == base64.b64decode(good, validate=True)
        assert stray != good
        # ...but is not the string Violet sends, so it is rejected
        assert send(client, raw, signature=stray).status_code == 401


class TestBodyHandling:
    def test_missing_topic(self, client):
        assert send(client, ORDER, topic=None).status_code == 400

    def test_invalid_json(self, client):
        assert send(client, b"not json").status_code == 400

    @pytest.mark.parametrize("raw", [b"null", b"[1,2]", b"42", b'"text"'])
    def test_body_must_be_an_object(self, client, raw):
        assert send(client, raw).status_code == 400

    @pytest.mark.parametrize("topic", ["ORDER_UPDATED", "MERCHANT_ENABLED", "TRANSFER_SENT"])
    def test_wrong_typed_fields_are_ignored(self, client, topic):
        weird = {"id": {"nested": True}, "status": ["ACTIVE"], "name": 7, "amount": "11428", "currency": None}
        assert send(client, weird, topic=topic).status_code == 200

    def test_secret_not_configured(self, client, monkeypatch):
        monkeypatch.delenv("VIOLET_WEBHOOK_SECRET")
        assert send(client, ORDER).status_code == 500


class TestVerifyFunction:
    def test_non_ascii_header_is_rejected_not_raised(self):
        assert verify_violet_signature(b"{}", "é" * 44, SECRET) is False
        assert verify_violet_signature(b"{}", None, SECRET) is False
        good = sign(b"{}")
        assert verify_violet_signature(b"{}", good + "\n", SECRET) is False
        assert verify_violet_signature(b"{}", good, SECRET) is True
