# Generated with: speed-webhooks skill
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

# Speed secrets look like "wsec_" + base64(key bytes). The HMAC key is the
# decoded part after the prefix. SPEED_WEBHOOK_SECRET holds the value exactly
# as Speed shows it, wsec_ prefix included.
KEY_BYTES = b"speed-test-signing-key-0123456789"
SECRET = "wsec_" + base64.b64encode(KEY_BYTES).decode()

os.environ["SPEED_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_event_ids, to_standard_secret  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, key: bytes = KEY_BYTES) -> str:
    """Sign like Speed: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}"))."""
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, key=KEY_BYTES, signature=None, prefix="webhook"):
    """Headers for a delivery. `prefix` is "webhook" (Speed) or "svix" (fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, key),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/speed", content=raw_body, headers=headers)


def event(event_type, obj, **extra):
    return {
        "id": f"evt_{uuid.uuid4().hex[:16]}",
        "object": "events",
        "api_version": "2022-10-15",
        "event_type": event_type,
        "data": {"object": obj, **extra},
        "livemode": False,
        "request": {"id": "req_1"},
        "created": 1696847071760,
        "modified": 1696847071760,
    }


def payment_paid():
    return event(
        "payment.paid",
        {"id": "pi_abc123", "object": "payment", "amount": 5000, "currency": "SATS", "status": "paid"},
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SPEED_WEBHOOK_SECRET", SECRET)
    processed_event_ids.clear()


class TestSecretHandling:
    def test_wsec_becomes_whsec(self):
        assert to_standard_secret("wsec_abc=") == "whsec_abc="

    def test_whsec_is_left_alone(self):
        assert to_standard_secret("whsec_abc=") == "whsec_abc="

    def test_secret_configured_with_whsec_prefix(self, monkeypatch):
        monkeypatch.setenv("SPEED_WEBHOOK_SECRET", "whsec_" + base64.b64encode(KEY_BYTES).decode())
        body = json.dumps(payment_paid())
        assert post(body, signed_headers(body)).status_code == 200


class TestValidSignatures:
    def test_payment_paid(self, caplog):
        body = json.dumps(payment_paid())
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "payment.paid: pi_abc123 (5000 SATS" in caplog.text

    def test_payment_created(self, caplog):
        body = json.dumps(event("payment.created", {"id": "pi_1", "amount": 100, "currency": "SATS", "status": "unpaid"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "payment.created: pi_1" in caplog.text

    def test_payment_confirmed(self, caplog):
        body = json.dumps(event("payment.confirmed", {"id": "pi_2", "amount": 100, "currency": "SATS", "status": "paid"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "payment.confirmed: pi_2" in caplog.text

    def test_checkout_session_paid(self, caplog):
        body = json.dumps(event("checkout_session.paid", {"id": "cs_1", "status": "paid"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "checkout_session.paid: cs_1" in caplog.text

    def test_withdraw_failed(self, caplog):
        body = json.dumps(event("withdraw.failed", {"id": "wd_1", "status": "failed"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "withdraw.failed: wd_1" in caplog.text

    def test_connect_event_with_account_id(self, caplog):
        body = json.dumps(event("connect.completed", {}, account_id="acct_1"))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "connect.completed: acct_1" in caplog.text

    def test_unknown_event_type_is_acknowledged(self):
        body = json.dumps(event("something.new", {"id": "x_1"}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(payment_paid())
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_any_one_of_several_signatures_matches(self):
        body = json.dumps(payment_paid())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_other_signature_versions_are_ignored(self):
        body = json.dumps(payment_paid())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1a,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_retry_with_new_webhook_id_is_skipped(self):
        body = json.dumps(payment_paid())
        first = post(body, signed_headers(body))
        second = post(body, signed_headers(body, timestamp=now() + 1))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestSvixHeaderFallback:
    def test_svix_headers_are_accepted(self):
        body = json.dumps(payment_paid())
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(payment_paid())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(payment_paid())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(payment_paid())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = json.dumps(payment_paid())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_other_endpoints_secret(self):
        body = json.dumps(payment_paid())
        res = post(body, signed_headers(body, key=b"another-endpoint-secret-01234567"))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = json.dumps(payment_paid())
        headers = signed_headers(body)
        assert post(body.replace("5000", "9000"), headers).status_code == 400

    def test_timestamp_outside_tolerance(self):
        body = json.dumps(payment_paid())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_undecoded_secret_string_as_key(self):
        body = json.dumps(payment_paid())
        undecoded = SECRET[len("wsec_"):].encode()
        assert post(body, signed_headers(body, key=undecoded)).status_code == 400


class TestFailClosed:
    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("SPEED_WEBHOOK_SECRET", raising=False)
        body = json.dumps(payment_paid())
        assert post(body, signed_headers(body)).status_code == 500
