# Generated with: yoco-webhooks skill
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

# Yoco secrets are "whsec_" + base64. The HMAC key is the base64-DECODED part
# after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"yoco-test-signing-key-0123456789").decode()

os.environ["YOCO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Yoco (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/yoco", content=raw_body, headers=headers)


def yoco_api_event(event_type: str, **extra) -> dict:
    """Yoco API payload (flat, `event_type`)."""
    return {
        "business_id": "f3f777bb-ca3c-4638-bc79-8fcf0fd0f8f1",
        "event_type": event_type,
        "order_id": "e13ed7f6-56a5-42f4-be6b-f87063ffd8f3",
        **extra,
    }


def checkout_event(event_type: str, payload: dict) -> dict:
    """Checkout API payload (`type` + nested `payload`)."""
    return {
        "createdDate": "2026-10-21T08:00:00.000Z",
        "id": f"evt_{uuid.uuid4().hex}",
        "type": event_type,
        "payload": payload,
    }


def payment_created() -> dict:
    return yoco_api_event("payment.created", payment_id="d2ff5a9a-0998-46e2-aebe-2c72c3ddde1f")


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["YOCO_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["YOCO_WEBHOOK_SECRET"] = SECRET


class TestYocoApiEvents:
    def test_payment_created(self, caplog):
        body = json.dumps(payment_created())
        with caplog.at_level(logging.INFO, logger="yoco-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "d2ff5a9a-0998-46e2-aebe-2c72c3ddde1f created" in caplog.text

    def test_payment_refunded(self, caplog):
        body = json.dumps(
            yoco_api_event("payment.refunded", payment_id="d2ff5a9a-0998-46e2-aebe-2c72c3ddde1f")
        )
        with caplog.at_level(logging.INFO, logger="yoco-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "refunded" in caplog.text

    def test_order_completed(self, caplog):
        body = json.dumps(yoco_api_event("order.completed"))
        with caplog.at_level(logging.INFO, logger="yoco-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "order.completed" in caplog.text


class TestCheckoutApiEvents:
    def test_payment_succeeded_reads_checkout_id(self, caplog):
        body = json.dumps(
            checkout_event(
                "payment.succeeded",
                {
                    "amount": 2900,
                    "createdDate": "2026-10-21T08:00:00.000Z",
                    "currency": "ZAR",
                    "id": "p_8yN3kZ1qWx",
                    "metadata": {"checkoutId": "ch_KnqVxyzA2b"},
                    "mode": "live",
                    "status": "succeeded",
                    "type": "payment",
                    "paymentMethodDetails": {"type": "card"},
                },
            )
        )
        with caplog.at_level(logging.INFO, logger="yoco-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "ch_KnqVxyzA2b paid" in caplog.text

    def test_refund_failed(self, caplog):
        body = json.dumps(
            checkout_event(
                "refund.failed",
                {
                    "amount": 2900,
                    "createdDate": "2026-10-21T08:00:00.000Z",
                    "currency": "ZAR",
                    "failureReason": "Insufficient balance",
                    "id": "rf_1a2b3c",
                    "mode": "live",
                    "status": "failed",
                    "type": "refund",
                },
            )
        )
        with caplog.at_level(logging.INFO, logger="yoco-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Insufficient balance" in caplog.text


class TestDeliveryBehaviour:
    def test_unknown_event_type_acknowledged(self):
        body = json.dumps(yoco_api_event("something.new"))
        assert post(body, signed_headers(body)).status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = json.dumps(payment_created())
        headers = signed_headers(body)
        headers["webhook-signature"] = (
            "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        )
        assert post(body, headers).status_code == 200

    def test_duplicate_webhook_id_returns_200(self):
        body = json.dumps(payment_created())
        msg_id = f"msg_dup_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, webhook_id=msg_id))
        second = post(body, signed_headers(body, webhook_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(payment_created())
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_malformed_signature_header(self):
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, signature="not-a-signature"))
        assert res.status_code == 400

    def test_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = json.dumps(payment_created())
        headers = signed_headers(body)
        res = post(body.replace("payment.created", "payment.refunded"), headers)
        assert res.status_code == 400

    def test_timestamp_older_than_three_minutes(self):
        # 4 minutes: inside the SDK's 5-minute default, outside Yoco's 3 minutes.
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, timestamp=now() - 240))
        assert res.status_code == 400

    def test_timestamp_in_the_future(self):
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, timestamp=now() + 240))
        assert res.status_code == 400

    def test_non_numeric_timestamp(self):
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body, timestamp="not-a-number"))
        assert res.status_code == 400

    def test_undecoded_secret_as_key_rejected(self):
        body = json.dumps(payment_created())
        msg_id, ts = "msg_undecoded", str(now())
        wrong = hmac.new(
            SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
        ).digest()
        res = post(
            body,
            signed_headers(
                body,
                webhook_id=msg_id,
                timestamp=ts,
                signature="v1," + base64.b64encode(wrong).decode(),
            ),
        )
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self):
        os.environ.pop("YOCO_WEBHOOK_SECRET", None)
        body = json.dumps(payment_created())
        res = post(body, signed_headers(body))
        assert res.status_code == 500
