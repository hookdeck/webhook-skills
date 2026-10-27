# Generated with: pine-labs-webhooks skill
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

# Pine Labs' secret key is used as raw UTF-8 bytes (no whsec_ prefix, no base64 decoding).
SECRET = "pl_test_secret_key_abc1234"
OTHER_SECRET = "pl_some_other_secret_key_999"

os.environ["PINE_LABS_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Standard Webhooks: HMAC-SHA256 over `{id}.{timestamp}.{body}`, base64."""
    digest = hmac.new(secret.encode("utf-8"), f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(now() if timestamp is None else timestamp)
    return {
        "Content-Type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/pine-labs", content=raw_body, headers=headers)


def order(status):
    return {"order_id": "v1-240909084141-aa-O2oJwd", "type": "CHARGE", "status": status,
            "order_amount": {"value": 200, "currency": "INR"}}


def refund(status):
    return {**order(status), "order_id": "v1-240828181713-aa-hNlYwt", "parent_order_id": "v1-241010055924-aa-AHbN0s", "type": "REFUND"}


def customer(status):
    return {"customer": {"customer_id": "cust-v1-0811030624-aa-RBDgpR", "status": status}}


def token(status):
    return {"token": {"token_id": "token-v1-0811030624-aa-RBDgpR", "status": status}}


def subscription(status):
    return {"subscription": {"subscription_id": "v1-sub-4405071524-aa-qlAtAf", "status": status}}


EVENTS = {
    "CUSTOMER_ACTIVATED": customer("ACTIVE"),
    "CUSTOMER_DELETED": customer("DELETED"),
    "CUSTOMER_SUSPENDED": customer("SUSPENDED"),
    "CUSTOMER_CREATION_FAILED": customer("FAILED"),
    "ORDER_AUTHORIZED": order("AUTHORIZED"),
    "ORDER_PROCESSED": order("PROCESSED"),
    "ORDER_CANCELLED": order("CANCELLED"),
    "PAYMENT_FAILED": order("ATTEMPTED"),
    "ORDER_FAILED": order("FAILED"),
    "REFUND_PROCESSED": refund("PROCESSED"),
    "REFUND_FAILED": refund("FAILED"),
    "TOKEN_ACTIVATED": token("ACTIVE"),
    "TOKEN_DEACTIVATED": token("DEACTIVATED"),
    "TOKEN_SUSPENDED": token("SUSPENDED"),
    "TOKEN_PROVISION_FAILED": token("FAILED"),
    "SUBSCRIPTION_ACTIVATED": subscription("ACTIVE"),
    "SUBSCRIPTION_PENDING": subscription("PENDING"),
    "SUBSCRIPTION_PAUSED": subscription("PAUSED"),
    "SUBSCRIPTION_RESUMED": subscription("RESUMED"),
    "SUBSCRIPTION_COMPLETED": subscription("COMPLETED"),
    "SUBSCRIPTION_CHARGED": subscription("ACTIVE"),
    "SUBSCRIPTION_HALTED": subscription("HALTED"),
    "SUBSCRIPTION_CANCELLED": subscription("CANCELLED"),
    "SUBSCRIPTION_REVOKE_FAILED": subscription("ACTIVE"),
    "SUBSCRIPTION_UPDATED": subscription("ACTIVE"),
    "SUBSCRIPTION_UPDATE_FAILED": subscription("ACTIVE"),
    "ORDER_SETTLED": order("SETTLED"),
    "ORDER_SETTLEMENT_REJECTED": order("SETTLEMENT_REJECTED"),
}


def body(event_type):
    return json.dumps({"event_type": event_type, "data": EVENTS[event_type]})


def payout_body(event_type, status):
    return json.dumps({
        "eventId": "pytw-fc18909dee5e4430bb7d9914124e8d79",
        "data": {"clientReferenceId": "Payout_webhook_testing_01",
                 "paymentReferenceId": "txn-e28f0bcb241043c5959815f090e7971e", "status": status},
        "eventVersion": "1.0", "eventSource": "PAYOUT", "eventType": event_type,
    })


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PINE_LABS_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("PINE_LABS_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", list(EVENTS))
    def test_accepts_event(self, event_type, caplog):
        raw = body(event_type)
        with caplog.at_level(logging.INFO, logger="pine-labs-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert f"{event_type}:" in caplog.text

    @pytest.mark.parametrize("event_type,status", [("payout-transaction-success", "SUCCESS"), ("payout-transaction-failed", "FAILED")])
    def test_accepts_payout_event_with_camel_case_event_type(self, event_type, status, caplog):
        raw = payout_body(event_type, status)
        with caplog.at_level(logging.INFO, logger="pine-labs-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert f"{event_type}: payout Payout_webhook_testing_01" in caplog.text

    def test_verifies_the_example_from_the_pine_labs_docs(self, monkeypatch):
        # Docs example: secret abc1234 (raw UTF-8 key), signed content "{id}.{timestamp}.{body}"
        monkeypatch.setenv("PINE_LABS_WEBHOOK_SECRET", "abc1234")
        res = post('{"payload":"payload"}', {
            "Content-Type": "application/json",
            "webhook-id": "msg_2nEfCaUDn9fynC9Kz2upo1QSydl",
            "webhook-timestamp": "1728543028",
            "webhook-signature": "v1,Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=",
        })
        assert res.status_code == 200

    def test_accepts_whsec_secret_base64_decoding_the_part_after_the_prefix(self, monkeypatch):
        monkeypatch.setenv("PINE_LABS_WEBHOOK_SECRET", "whsec_" + base64.b64encode(b"decoded-key-bytes").decode())
        raw = body("ORDER_PROCESSED")
        msg_id, ts = "msg_whsec", str(now())
        digest = hmac.new(b"decoded-key-bytes", f"{msg_id}.{ts}.{raw}".encode(), hashlib.sha256).digest()
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature="v1," + base64.b64encode(digest).decode()))
        assert res.status_code == 200

    def test_accepts_svix_prefixed_headers(self):
        raw = body("ORDER_PROCESSED")
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        raw = body("ORDER_PROCESSED")
        headers = {**signed_headers(raw), "Content-Type": "text/plain"}
        assert post(raw, headers).status_code == 200

    def test_accepts_when_one_of_several_signatures_matches_ignoring_other_versions(self):
        raw = body("ORDER_PROCESSED")
        msg_id, ts = "msg_multi", str(now())
        good = sign(raw, msg_id, ts)
        signature = f"v1,{base64.b64encode(b'bogus').decode()} v1a,{good[3:]} {good}"
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 200

    def test_does_not_accept_a_signature_under_another_version(self):
        raw = body("ORDER_PROCESSED")
        msg_id, ts = "msg_v1a", str(now())
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature="v1a," + sign(raw, msg_id, ts)[3:]))
        assert res.status_code == 400

    def test_logs_unhandled_event_types_without_failing(self, caplog):
        raw = json.dumps({"event_type": "ORDER_EXPIRED", "data": {}})
        with caplog.at_level(logging.INFO, logger="pine-labs-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Pine Labs event: ORDER_EXPIRED" in caplog.text


class TestInvalidRequests:
    def test_rejects_signature_from_wrong_secret(self):
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_signature_made_with_base64_of_the_secret_as_key(self):
        raw = body("ORDER_PROCESSED")
        msg_id, ts = "msg_b64key", str(now())
        key = base64.b64encode(SECRET.encode()).decode().encode()
        digest = hmac.new(key, f"{msg_id}.{ts}.{raw}".encode(), hashlib.sha256).digest()
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature="v1," + base64.b64encode(digest).decode()))
        assert res.status_code == 400

    def test_rejects_tampered_body(self):
        raw = body("ORDER_PROCESSED")
        headers = signed_headers(raw)
        assert post(raw.replace("INR", "USD"), headers).status_code == 400

    def test_rejects_reserialised_body(self):
        raw = body("ORDER_PROCESSED")
        headers = signed_headers(raw)
        assert post(json.dumps(json.loads(raw), indent=2), headers).status_code == 400

    @pytest.mark.parametrize("ts", ["0", "-5", "1.5", "01", "12abc"])
    def test_rejects_malformed_timestamp(self, ts):
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, timestamp=ts)).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, timestamp=now() - 3600)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_is_set(self, monkeypatch):
        monkeypatch.setenv("PINE_LABS_WEBHOOK_TOLERANCE_SECONDS", "300")
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, timestamp=now() - 3600)).status_code == 400

    def test_treats_non_numeric_tolerance_as_zero(self, monkeypatch):
        monkeypatch.setenv("PINE_LABS_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, timestamp=now() - 3600)).status_code == 200

    def test_rejects_malformed_signature(self):
        raw = body("ORDER_PROCESSED")
        assert post(raw, signed_headers(raw, signature="v1,not-a-real-signature")).status_code == 400

    @pytest.mark.parametrize("name", ["webhook-id", "webhook-timestamp", "webhook-signature"])
    def test_rejects_missing_header(self, name):
        raw = body("ORDER_PROCESSED")
        headers = signed_headers(raw)
        del headers[name]
        res = post(raw, headers)
        assert res.status_code == 400


class TestDeduplication:
    def test_acknowledges_repeated_webhook_id_without_reprocessing(self, caplog):
        raw = body("REFUND_PROCESSED")
        headers = signed_headers(raw, msg_id="msg_dupe_1")
        assert post(raw, headers).json() == {"received": True}
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="pine-labs-webhooks"):
            second = post(raw, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert "REFUND_PROCESSED:" not in caplog.text


class TestConfiguration:
    def test_fails_closed_when_secret_is_not_configured(self, monkeypatch):
        raw = body("ORDER_PROCESSED")
        headers = signed_headers(raw)
        monkeypatch.delenv("PINE_LABS_WEBHOOK_SECRET")
        assert post(raw, headers).status_code == 500

    def test_rejects_whsec_secret_with_empty_key(self, monkeypatch):
        monkeypatch.setenv("PINE_LABS_WEBHOOK_SECRET", "whsec_")
        raw = body("ORDER_PROCESSED")
        msg_id, ts = "msg_empty", str(now())
        digest = hmac.new(b"", f"{msg_id}.{ts}.{raw}".encode(), hashlib.sha256).digest()
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature="v1," + base64.b64encode(digest).decode()))
        assert res.status_code == 400


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
