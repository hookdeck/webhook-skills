import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["KOMOJU_WEBHOOK_SECRET"] = "komoju_test_secret_token"

from main import app, verify_komoju_signature  # noqa: E402

SECRET = os.environ["KOMOJU_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# Envelopes follow the example deliveries in KOMOJU's webhook docs (ping, payment.authorized); the
# other events reuse the same envelope
PING = json.dumps({
  "id": "do33foclbroj52ib9whb6yh4m",
  "type": "ping",
  "resource": "event",
  "data": {
    "id": "bll40gxhuhcw19vor5kx55akw",
    "resource": "webhook",
    "url": "http://example.com/hook",
    "active": True,
    "event_list": [
      "ping",
      "payment.captured"
    ],
    "created_at": "2018-11-13T06:19:49Z"
  },
  "created_at": "2018-11-13T06:19:49Z"
}).encode()
AUTHORIZED = json.dumps({
  "id": "dv7ywuavew3n2meqsllj5bbob",
  "type": "payment.authorized",
  "resource": "event",
  "data": {
    "id": "8xz5cn01gkt37cz0myd98k2f1",
    "resource": "payment",
    "status": "authorized",
    "amount": 1000,
    "tax": 80,
    "customer": None,
    "payment_deadline": "2018-11-20T14:59:59Z",
    "payment_details": {
      "type": "bank_transfer",
      "email": "test@example.com",
      "order_id": "Y5236584956"
    },
    "payment_method_fee": 0,
    "total": 1080,
    "currency": "JPY",
    "description": None,
    "captured_at": None,
    "external_order_num": "123",
    "metadata": {},
    "created_at": "2018-11-13T06:19:49Z",
    "amount_refunded": 0,
    "locale": "ja",
    "refunds": [],
    "refund_requests": []
  },
  "created_at": "2018-11-13T06:19:49Z"
}).encode()
CAPTURED = json.dumps({
  "id": "cap0000000000000000000001",
  "type": "payment.captured",
  "resource": "event",
  "data": {
    "id": "8xz5cn01gkt37cz0myd98k2f1",
    "resource": "payment",
    "status": "captured",
    "amount": 1000,
    "tax": 80,
    "customer": None,
    "payment_deadline": "2018-11-20T14:59:59Z",
    "payment_details": {
      "type": "bank_transfer",
      "email": "test@example.com",
      "order_id": "Y5236584956"
    },
    "payment_method_fee": 0,
    "total": 1080,
    "currency": "JPY",
    "description": None,
    "captured_at": "2018-11-13T07:00:00Z",
    "external_order_num": "123",
    "metadata": {},
    "created_at": "2018-11-13T06:19:49Z",
    "amount_refunded": 0,
    "locale": "ja",
    "refunds": [],
    "refund_requests": []
  },
  "created_at": "2018-11-13T06:19:49Z"
}).encode()
SUBSCRIPTION = json.dumps({
  "id": "sub0000000000000000000001",
  "type": "subscription.created",
  "resource": "event",
  "data": {
    "id": "sub1",
    "resource": "subscription",
    "status": "active",
    "currency": "JPY",
    "amount": 1000
  },
  "created_at": "2018-11-13T06:19:49Z"
}).encode()
UNKNOWN = json.dumps({
  "id": "set0000000000000000000001",
  "type": "settlement.created",
  "resource": "event",
  "data": {
    "id": "set1",
    "resource": "settlement"
  },
  "created_at": "2018-11-13T06:19:49Z"
}).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/komoju",
        content=body,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerify:
    def test_valid_including_uppercase(self):
        assert verify_komoju_signature(AUTHORIZED, sign(AUTHORIZED), SECRET)
        assert verify_komoju_signature(AUTHORIZED, sign(AUTHORIZED).upper(), SECRET)

    def test_non_ascii_bytes(self):
        body = '{"name":"株式会社DEGICA"}'.encode("utf-8")
        assert verify_komoju_signature(body, sign(body), SECRET)

    def test_invalid_variants(self):
        assert not verify_komoju_signature(AUTHORIZED, sign(AUTHORIZED, "other"), SECRET)
        assert not verify_komoju_signature(AUTHORIZED, "sha256=" + sign(AUTHORIZED), SECRET)
        assert not verify_komoju_signature(AUTHORIZED, None, SECRET)
        assert not verify_komoju_signature(AUTHORIZED, "", SECRET)
        assert not verify_komoju_signature(AUTHORIZED, "abcd", SECRET)
        assert not verify_komoju_signature(AUTHORIZED, "zz" * 32, SECRET)
        assert not verify_komoju_signature(AUTHORIZED, "é" * 64, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("body", [PING, AUTHORIZED, CAPTURED, SUBSCRIPTION, UNKNOWN])
    def test_signed_event(self, body):
        res = post(body, {"x-komoju-signature": sign(body)})
        assert res.status_code == 200
        assert res.json()["received"] is True

    def test_any_content_type(self):
        res = client.post(
            "/webhooks/komoju",
            content=CAPTURED,
            headers={"Content-Type": "text/plain", "x-komoju-signature": sign(CAPTURED)},
        )
        assert res.status_code == 200

    def test_duplicate_event_id(self):
        body = json.dumps({"id": "dup-1", "type": "payment.updated", "resource": "event", "data": {}}).encode()
        first = post(body, {"x-komoju-signature": sign(body)})
        second = post(body, {"x-komoju-signature": sign(body)})
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}

    def test_unsigned_rejected(self):
        assert post(AUTHORIZED).status_code == 401

    def test_bad_signature_rejected(self):
        assert post(AUTHORIZED, {"x-komoju-signature": sign(AUTHORIZED, "wrong")}).status_code == 401

    def test_malformed_signature_rejected(self):
        assert post(AUTHORIZED, {"x-komoju-signature": "abc"}).status_code == 401

    def test_tampered_body_rejected(self):
        res = post(AUTHORIZED.replace(b"1000", b"9000"), {"x-komoju-signature": sign(AUTHORIZED)})
        assert res.status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/komoju",
            content=AUTHORIZED,
            headers={"Content-Type": "application/json", "x-komoju-signature": "é".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_malformed_signed_json(self):
        bad = b"{not json"
        assert post(bad, {"x-komoju-signature": sign(bad)}).status_code == 400

    @pytest.mark.parametrize("body", [b"null", b"42", b"[1,2]"])
    def test_signed_non_object_body(self, body):
        assert post(body, {"x-komoju-signature": sign(body)}).status_code == 400
