# Generated with: autumn-webhooks skill
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
SECRET = "whsec_" + base64.b64encode(b"autumn-test-signing-key-0123456").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-webhook-signing-key00").decode()

os.environ["AUTUMN_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("AUTUMN_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Autumn (Svix)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None,
                   content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/autumn", content=raw_body, headers=headers)


PAYLOADS = {
    "billing.updated": {
        "object": "billing.updated",
        "customer_id": "user_123",
        "plan_changes": [
            {
                "action": "updated",
                "subscription": {"plan_id": "pro", "status": "active", "past_due": False,
                                 "canceled_at": 1761840000000},
                "previous_attributes": {"canceled_at": None, "expires_at": None},
                "item_changes": [],
            }
        ],
        "tags": ["trial_ended"],
    },
    "customer.products.updated": {
        "customer_id": "user_123",
        "plan_changes": [{"action": "activated", "purchase": {"plan_id": "credits_pack", "status": "active"}}],
        "tags": [],
    },
    "balances.limit_reached": {"customer_id": "user_123", "feature_id": "api_calls", "limit_type": "included"},
    "balances.usage_alert_triggered": {
        "customer_id": "user_123",
        "feature_id": "api_calls",
        "usage_alert": {"name": "80% usage warning", "threshold": 80, "threshold_type": "usage_percentage"},
    },
    "billing.auto_topup_succeeded": {
        "customer_id": "user_123",
        "feature_id": "credits",
        "quantity_granted": 1000,
        "threshold": 500,
        "balance_after": 1450,
        "invoice_mode": False,
        "invoice": {"stripe_id": "in_1A2B3C4D5E6F", "status": "paid", "total": 1000, "currency": "usd"},
    },
    "billing.auto_topup_failed": {
        "customer_id": "user_123",
        "feature_id": "credits",
        "reason": "charge_failed",
        "quantity": 1000,
        "threshold": 500,
        "balance": 250,
        "invoice_mode": False,
        "error": {"code": "card_declined", "message": "Your card was declined.", "type": "card_error"},
    },
    "invoice.finalized": {
        "id": "inv_123",
        "stripe_id": "in_1A2B3C4D5E6F",
        "customer_id": "user_123",
        "status": "paid",
        "total": 2000,
        "currency": "usd",
        "plan_ids": ["pro"],
        "items": [],
    },
}


def event_body(event_type: str, data=None) -> str:
    return json.dumps({"type": event_type, "data": PAYLOADS[event_type] if data is None else data})


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", list(PAYLOADS))
    def test_accepts_event(self, event_type):
        body = event_body(event_type)
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dispatches_on_body_type(self, caplog):
        body = event_body("balances.limit_reached")
        with caplog.at_level(logging.INFO, logger="autumn-webhooks"):
            post(body, signed_headers(body))
        assert "Limit reached (included) on api_calls" in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        body = event_body("something.new", {})
        with caplog.at_level(logging.INFO, logger="autumn-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Autumn event type: something.new" in caplog.text

    @pytest.mark.parametrize("content_type", ["application/json; charset=utf-8", "text/plain",
                                              "application/octet-stream"])
    def test_verifies_regardless_of_content_type(self, content_type):
        body = event_body("billing.updated")
        res = post(body, signed_headers(body, content_type=content_type))
        assert res.status_code == 200

    def test_accepts_when_any_signature_matches(self):
        body = event_body("billing.updated")
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= {headers['svix-signature']}"
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = event_body("billing.updated")
        headers = signed_headers(body)
        res = post(body.replace("user_123", "user_999"), headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Invalid signature"}

    def test_rejects_other_webhook_secret(self):
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_future_timestamp(self):
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, timestamp=now() + 600)).status_code == 400

    def test_rejects_malformed_signature_header(self):
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, signature="garbage")).status_code == 400

    @pytest.mark.parametrize("name", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, name):
        body = event_body("billing.updated")
        headers = signed_headers(body)
        del headers[name]
        res = post(body, headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Missing Svix signature headers"}

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("AUTUMN_WEBHOOK_SECRET")
        body = event_body("billing.updated")
        assert post(body, signed_headers(body)).status_code == 500


class TestTimestampWindow:
    """Hookdeck retries and replays resend the original timestamp."""

    ten_minutes_ago = staticmethod(lambda: now() - 600)
    two_days_ago = staticmethod(lambda: now() - 2 * 24 * 3600)

    def test_svix_library_rejects_signature_older_than_five_minutes(self):
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, timestamp=self.ten_minutes_ago())).status_code == 400

    def test_manual_verifier_with_widened_window_accepts_late_retry(self, monkeypatch):
        monkeypatch.setenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "86400")
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, timestamp=self.ten_minutes_ago())).status_code == 200

    def test_manual_verifier_rejects_outside_widened_window(self, monkeypatch):
        monkeypatch.setenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "86400")
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, timestamp=self.two_days_ago())).status_code == 400

    def test_manual_verifier_with_window_off_accepts_any_age(self, monkeypatch):
        monkeypatch.setenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "off")
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, timestamp=self.two_days_ago())).status_code == 200

    def test_manual_verifier_still_rejects_bad_signature_and_wrong_secret(self, monkeypatch):
        monkeypatch.setenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "off")
        body = event_body("billing.updated")
        assert post(body, signed_headers(body, signature="v1,AAAA")).status_code == 400
        assert post(body, signed_headers(body, secret=OTHER_SECRET)).status_code == 400

    def test_manual_verifier_checks_every_v1_entry(self, monkeypatch):
        monkeypatch.setenv("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "off")
        body = event_body("billing.updated")
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,AAAA v2,ignored {headers['svix-signature']}"
        assert post(body, headers).status_code == 200


class TestDeduplication:
    def test_acknowledges_retry_with_same_svix_id(self):
        body = event_body("billing.auto_topup_failed")
        headers = signed_headers(body, msg_id="msg_dedupe_1")
        assert post(body, headers).json() == {"received": True}
        second = post(body, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").status_code == 200
