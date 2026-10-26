import hashlib
import hmac
import itertools
import json
import os

import pytest
from fastapi.testclient import TestClient

# Checkout Page signing secrets are used as plain UTF-8 bytes
SECRET = "test_checkout_page_signing_secret"
os.environ["CHECKOUT_PAGE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_checkout_page_webhook  # noqa: E402

client = TestClient(app)
_counter = itertools.count(1)


def digest(payload: bytes, key: str = SECRET) -> str:
    """hex(HMAC-SHA256(secret, rawBody))"""
    return hmac.new(key.encode(), payload, hashlib.sha256).hexdigest()


def sign(payload: bytes, key: str = SECRET) -> str:
    return f"sha256={digest(payload, key)}"


def make_event(event: str, data=None) -> bytes:
    return json.dumps(
        {
            "sellerId": "seller_123",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "eventId": f"evt_{next(_counter)}",
            "event": event,
            "data": data or {},
        }
    ).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {
        "content-type": content_type,
        "x-webhook-timestamp": "1767225600",
        "x-webhook-delivery-attempt": "1",
    }
    if signature is not None:
        headers["x-webhook-signature"] = signature
    return client.post("/webhooks/checkout-page", content=body, headers=headers)


class TestVerify:
    body = make_event("payment.paid", {"payment": {"id": "pay_1"}})

    def test_accepts_prefixed_bare_and_uppercase(self):
        assert verify_checkout_page_webhook(self.body, sign(self.body), SECRET)
        assert verify_checkout_page_webhook(self.body, digest(self.body), SECRET)
        assert verify_checkout_page_webhook(self.body, f"sha256={digest(self.body).upper()}", SECRET)

    def test_rejects_wrong_secret_and_tampered_body(self):
        assert not verify_checkout_page_webhook(self.body, sign(self.body, "wrong"), SECRET)
        assert not verify_checkout_page_webhook(self.body.replace(b"pay_1", b"pay_2"), sign(self.body), SECRET)

    def test_rejects_malformed_values(self):
        d = digest(self.body)
        for bad in (f"sha256={d[:62]}", f"sha256={d}00", f"sha256={d[:63]}z", f"sha512={d}", "", None):
            assert not verify_checkout_page_webhook(self.body, bad, SECRET)
        assert not verify_checkout_page_webhook(self.body, sign(self.body), None)


class TestWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        assert post(make_event("payment.paid")).status_code == 401

    def test_invalid_signature_returns_401(self):
        res = post(make_event("payment.paid"), "sha256=" + "a" * 64)
        assert res.status_code == 401
        assert res.json() == {"error": "Invalid signature"}

    def test_malformed_signature_returns_401(self):
        assert post(make_event("payment.paid"), "not-a-signature").status_code == 401

    @pytest.mark.parametrize(
        "event",
        [
            "payment.paid",
            "payment.created",
            "payment.abandoned",
            "booking.created",
            "booking.paid",
            "subscription.created",
            "subscription.canceled",
            "customer.created",
            "submission.created",
            "product.updated",
        ],
    )
    def test_signed_events_return_200(self, event):
        body = make_event(event)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dedupes_retries_on_event_id(self):
        body = make_event("payment.paid")
        post(body, sign(body))
        assert post(body, sign(body)).json() == {"received": True, "duplicate": True}

    def test_verifies_exact_bytes_for_non_json(self):
        body = b"not json"
        assert post(body, "sha256=" + "a" * 64, "text/plain").status_code == 401
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("CHECKOUT_PAGE_WEBHOOK_SECRET")
        body = make_event("payment.paid")
        assert post(body, sign(body)).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
