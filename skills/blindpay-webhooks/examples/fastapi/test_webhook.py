# Generated with: blindpay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"blindpay-test-signing-key-012345").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-webhook-signing-key00").decode()

os.environ["BLINDPAY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

EVENTS = [
    "customer.new", "customer.update", "customer.delete", "bankAccount.new",
    "blockchainWallet.new", "blockchainWallet.update", "tos.accept",
    "payin.new", "payin.update", "payin.complete",
    "payout.new", "payout.update", "payout.complete",
    "virtualAccount.new", "virtualAccount.complete",
    "transfer.new", "transfer.update", "transfer.complete",
    "wallet.new", "wallet.update", "wallet.inbound",
    "limitIncrease.new", "limitIncrease.update",
    "payable.new", "payable.update", "payable.complete",
]


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Svix / BlindPay."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/blindpay", content=raw_body, headers=headers)


def event(webhook_event: str, **extra) -> dict:
    return {
        "webhook_event": webhook_event,
        "id": "pi_000000000000",
        "status": "processing",
        "customer_id": "cu_000000000000",
        **extra,
    }


class TestValidSignatures:
    @pytest.mark.parametrize("name", EVENTS)
    def test_accepts_event(self, name, caplog):
        raw = json.dumps(event(name))
        with caplog.at_level(logging.INFO, logger="blindpay-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled BlindPay event type" not in caplog.text

    def test_unknown_event_is_acknowledged(self, caplog):
        raw = json.dumps(event("thing.new"))
        with caplog.at_level(logging.INFO, logger="blindpay-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled BlindPay event type: thing.new" in caplog.text

    def test_accepts_any_content_type(self):
        raw = json.dumps(event("payin.complete"))
        res = post(raw, signed_headers(raw, content_type="application/vnd.api+json"))
        assert res.status_code == 200

    def test_accepts_body_with_significant_whitespace(self):
        raw = '{ "webhook_event" : "payin.complete",\n  "id": "pi_1" }'
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200

    def test_accepts_when_any_signature_matches(self):
        raw = json.dumps(event("payout.complete"))
        msg_id, ts = "msg_multi", str(now())
        signature = f"v1,{base64.b64encode(b'bogus').decode()} {sign(raw, msg_id, ts)}"
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 200


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        raw = json.dumps(event("payin.complete"))
        headers = signed_headers(raw)
        res = post(raw.replace("pi_000000000000", "pi_999999999999"), headers)
        assert res.status_code == 400

    def test_rejects_other_secret(self):
        raw = json.dumps(event("payin.complete"))
        res = post(raw, signed_headers(raw, secret=OTHER_SECRET))
        assert res.status_code == 400

    def test_rejects_old_timestamp(self):
        raw = json.dumps(event("payin.complete"))
        res = post(raw, signed_headers(raw, timestamp=now() - 600))
        assert res.status_code == 400

    def test_rejects_future_timestamp(self):
        raw = json.dumps(event("payin.complete"))
        res = post(raw, signed_headers(raw, timestamp=now() + 600))
        assert res.status_code == 400

    @pytest.mark.parametrize("name", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(event("payin.complete"))
        headers = signed_headers(raw)
        del headers[name]
        res = post(raw, headers)
        assert res.status_code == 400


class TestDeduplication:
    def test_retry_with_same_svix_id_is_not_reprocessed(self):
        raw = json.dumps(event("payin.complete"))
        headers = signed_headers(raw)
        first = post(raw, headers)
        assert first.json() == {"received": True}
        second = post(raw, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestConfiguration:
    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("BLINDPAY_WEBHOOK_SECRET")
        raw = json.dumps(event("payin.complete"))
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500

    def test_health(self):
        assert client.get("/health").status_code == 200
