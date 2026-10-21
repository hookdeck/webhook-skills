import hashlib
import hmac
import json
import os
import time
import uuid

# RevenueCat signing secrets are opaque strings used as a UTF-8 HMAC key
# (no prefix to strip, no base64 decoding).
SECRET = "rc_test_signing_secret_9f2c4e1a7b3d5f80"
AUTH = "Bearer rc-test-auth-token-5d1e9a"
os.environ["REVENUECAT_WEBHOOK_SECRET"] = SECRET
os.environ["REVENUECAT_WEBHOOK_AUTH"] = AUTH

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    parse_signature_header,
    verify_authorization_header,
    verify_revenuecat_signature,
)

client = TestClient(app)


def now() -> int:
    return int(time.time())


def sign(payload: str, secret: str = SECRET, timestamp: int | str | None = None) -> str:
    t = now() if timestamp is None else timestamp
    return hmac.new(secret.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()


def signature_header(payload: str, secret: str = SECRET, timestamp: int | None = None) -> str:
    """Build X-RevenueCat-Webhook-Signature: t=<seconds>,v1=<hex>"""
    t = now() if timestamp is None else timestamp
    return f"t={t},v1={sign(payload, secret, t)}"


def build_event(event_type: str, **extra) -> dict:
    return {
        "api_version": "1.0",
        "event": {
            "id": f"evt-{event_type}-{uuid.uuid4()}",
            "type": event_type,
            "event_timestamp_ms": 1591121855319,
            "app_id": "app1234",
            "app_user_id": "user_123",
            "original_app_user_id": "user_123",
            "aliases": ["user_123"],
            "product_id": "onemonth_no_trial",
            "entitlement_ids": ["pro"],
            "environment": "PRODUCTION",
            "store": "APP_STORE",
            **extra,
        },
    }


INITIAL_PURCHASE = build_event("INITIAL_PURCHASE", price=2.49, currency="USD")


def post(payload: str, signature: str | None = None, auth: str | None = AUTH):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-RevenueCat-Webhook-Signature"] = signature
    if auth:
        headers["Authorization"] = auth
    return client.post("/webhooks/revenuecat", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def restore_env():
    yield
    os.environ["REVENUECAT_WEBHOOK_SECRET"] = SECRET
    os.environ["REVENUECAT_WEBHOOK_AUTH"] = AUTH


class TestParseSignatureHeader:
    def test_parses_t_and_v1(self):
        assert parse_signature_header("t=1700000000,v1=abc") == ("1700000000", 1, ["abc"])


class TestVerifySignature:
    body = json.dumps(INITIAL_PURCHASE)

    def test_accepts_valid_signature(self):
        assert verify_revenuecat_signature(self.body.encode(), signature_header(self.body), SECRET) == (True, None)

    def test_rejects_other_secret(self):
        header = signature_header(self.body, secret="other_secret")
        assert verify_revenuecat_signature(self.body.encode(), header, SECRET) == (False, "Invalid signature")

    def test_rejects_missing_header(self):
        ok, error = verify_revenuecat_signature(self.body.encode(), None, SECRET)
        assert not ok and "Missing" in error

    def test_rejects_header_without_t_or_v1(self):
        for header in (f"v1={sign(self.body)}", f"t={now()}"):
            ok, error = verify_revenuecat_signature(self.body.encode(), header, SECRET)
            assert not ok and "Malformed" in error

    def test_rejects_non_decimal_t(self):
        header = f"t=1e9,v1={sign(self.body, timestamp='1e9')}"
        ok, error = verify_revenuecat_signature(self.body.encode(), header, SECRET)
        assert not ok and "Malformed" in error

    def test_rejects_timestamps_beyond_tolerance(self):
        for t in (now() - 301, now() + 301):
            ok, error = verify_revenuecat_signature(self.body.encode(), signature_header(self.body, timestamp=t), SECRET)
            assert not ok and "Timestamp" in error


class TestVerifyAuthorization:
    def test_accepts_exact_value(self):
        assert verify_authorization_header(AUTH, AUTH) == (True, None)

    def test_rejects_other_values(self):
        assert verify_authorization_header("Bearer wrong", AUTH)[0] is False
        assert verify_authorization_header(AUTH + "x", AUTH)[0] is False
        assert verify_authorization_header(None, AUTH)[0] is False


class TestWebhookEndpoint:
    def test_valid_request_returns_200(self):
        payload = json.dumps(INITIAL_PURCHASE)
        res = post(payload, signature_header(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_missing_signature_returns_401(self):
        res = post(json.dumps(INITIAL_PURCHASE))
        assert res.status_code == 401
        assert "X-RevenueCat-Webhook-Signature" in res.json()["error"]

    def test_invalid_signature_returns_401(self):
        res = post(json.dumps(INITIAL_PURCHASE), f"t={now()},v1={'0' * 64}")
        assert res.status_code == 401
        assert res.json()["error"] == "Invalid signature"

    def test_tampered_payload_returns_401(self):
        original = json.dumps(INITIAL_PURCHASE)
        tampered = json.dumps({**INITIAL_PURCHASE, "event": {**INITIAL_PURCHASE["event"], "price": 0}})
        assert post(tampered, signature_header(original)).status_code == 401

    def test_reserialised_body_returns_401(self):
        raw = json.dumps(INITIAL_PURCHASE, indent=2)
        reserialised = json.dumps(json.loads(raw))
        assert post(reserialised, signature_header(raw)).status_code == 401

    def test_stale_timestamp_returns_401(self):
        payload = json.dumps(INITIAL_PURCHASE)
        res = post(payload, signature_header(payload, timestamp=now() - 600))
        assert res.status_code == 401
        assert "Timestamp" in res.json()["error"]

    def test_wrong_authorization_returns_401_even_with_valid_signature(self):
        payload = json.dumps(INITIAL_PURCHASE)
        res = post(payload, signature_header(payload), auth="Bearer wrong")
        assert res.status_code == 401
        assert res.json()["error"] == "Invalid Authorization header"

    def test_authorization_only_mode(self):
        del os.environ["REVENUECAT_WEBHOOK_SECRET"]
        assert post(json.dumps(INITIAL_PURCHASE)).status_code == 200
        assert post(json.dumps(INITIAL_PURCHASE), auth="Bearer wrong").status_code == 401

    def test_signature_only_mode(self):
        del os.environ["REVENUECAT_WEBHOOK_AUTH"]
        payload = json.dumps(INITIAL_PURCHASE)
        assert post(payload, signature_header(payload), auth=None).status_code == 200

    def test_unconfigured_returns_500(self):
        del os.environ["REVENUECAT_WEBHOOK_SECRET"]
        del os.environ["REVENUECAT_WEBHOOK_AUTH"]
        assert post(json.dumps(INITIAL_PURCHASE)).status_code == 500

    def test_missing_event_returns_400(self):
        payload = json.dumps({"api_version": "1.0"})
        assert post(payload, signature_header(payload)).status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        [
            "TEST",
            "INITIAL_PURCHASE",
            "RENEWAL",
            "CANCELLATION",
            "UNCANCELLATION",
            "NON_RENEWING_PURCHASE",
            "SUBSCRIPTION_PAUSED",
            "EXPIRATION",
            "BILLING_ISSUE",
            "PRODUCT_CHANGE",
            "SUBSCRIPTION_EXTENDED",
            "REFUND_REVERSED",
            "INVOICE_ISSUANCE",
            "TRANSFER",
            "TEMPORARY_ENTITLEMENT_GRANT",
            "VIRTUAL_CURRENCY_TRANSACTION",
            "EXPERIMENT_ENROLLMENT",
            "PURCHASE_REDEEMED",
            "PRICE_INCREASE_CONSENT_REQUIRED",
            "PRICE_INCREASE_CONSENT_APPROVED",
            "SOME_FUTURE_EVENT",
        ],
    )
    def test_event_types_return_200(self, event_type):
        payload = json.dumps(build_event(event_type))
        assert post(payload, signature_header(payload)).status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
