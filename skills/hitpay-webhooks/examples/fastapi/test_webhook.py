import hashlib
import hmac
import json
import os

import pytest

# Set test environment variables before importing the app
os.environ["HITPAY_WEBHOOK_SALT"] = "test_hitpay_webhook_salt_0123456789"

from fastapi.testclient import TestClient

from main import app, verify_hitpay_signature

client = TestClient(app)

SALT = os.environ["HITPAY_WEBHOOK_SALT"]

SAMPLE_BODY = {
    "id": "9e9a3451-a3e5-4fc5-9dfc-bc75e67c8808",
    "status": "succeeded",
    "currency": "sgd",
    "amount": 913.84,
    "refunded_amount": 0,
}


def sign(body: bytes, salt: str = SALT) -> str:
    """HitPay: hex HMAC-SHA256 of the raw body, keyed with the webhook's salt."""
    return hmac.new(salt.encode(), body, hashlib.sha256).hexdigest()


def post(body=None, obj="charge", event_type="created", signature=..., content_type="application/json"):
    if body is None:
        body = json.dumps(SAMPLE_BODY).encode()
    headers = {"Content-Type": content_type}
    if obj is not None:
        headers["Hitpay-Event-Object"] = obj
    if event_type is not None:
        headers["Hitpay-Event-Type"] = event_type
    if signature is ...:
        signature = sign(body)
    if signature is not None:
        # Send headers as raw bytes so non-ASCII values reach the app
        headers["Hitpay-Signature"] = signature
    raw_headers = {k: (v.encode("utf-8") if isinstance(v, str) else v) for k, v in headers.items()}
    return client.post("/webhooks/hitpay", content=body, headers=raw_headers)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(SAMPLE_BODY).encode()
        assert post(body=body, signature=sign(body).upper()).status_code == 200

    def test_rejects_wrong_salt(self):
        body = json.dumps(SAMPLE_BODY).encode()
        assert post(body=body, signature=sign(body, "api_key_salt")).status_code == 401

    def test_rejects_tampered_body(self):
        signature = sign(json.dumps(SAMPLE_BODY).encode())
        tampered = json.dumps({**SAMPLE_BODY, "amount": 1}).encode()
        assert post(body=tampered, signature=signature).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(signature=None).status_code == 401

    @pytest.mark.parametrize("signature", ["", "abc", "zz" * 32, "é" * 64])
    def test_rejects_malformed_signature_without_500(self, signature):
        assert post(signature=signature).status_code == 401

    def test_verifies_any_content_type(self):
        assert post(content_type="text/plain").status_code == 200

    def test_rejects_everything_when_salt_unset(self):
        assert verify_hitpay_signature(b"{}", sign(b"{}"), salt="") is False


class TestEventDispatch:
    @pytest.mark.parametrize(
        "obj,event_type",
        [
            ("charge", "created"), ("charge", "updated"), ("order", "created"), ("order", "updated"),
            ("invoice", "created"), ("invoice", "updated"), ("payout", "created"),
            ("transfer", "paid"), ("transfer", "failed"), ("transfer", "canceled"),
        ],
    )
    def test_handles_event(self, obj, event_type):
        assert post(obj=obj, event_type=event_type).status_code == 200

    def test_unknown_event_returns_200(self):
        assert post(obj="widget", event_type="created").status_code == 200

    def test_missing_event_headers_return_400(self):
        assert post(obj=None, event_type=None).status_code == 400


class TestBodyValidation:
    def test_signed_non_json_returns_400(self):
        assert post(body=b"not json").status_code == 400

    def test_signed_json_array_returns_400(self):
        assert post(body=b"[1]").status_code == 400
