import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app.
# The signing key is shown once in the Felloh dashboard; any string works, used as UTF-8 bytes.
os.environ["FELLOH_WEBHOOK_SECRET"] = "test_felloh_signing_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, classify, verify_felloh_signature

client = TestClient(app)

SECRET = os.environ["FELLOH_WEBHOOK_SECRET"]

# Payloads follow the samples in Felloh's webhook docs.
PAYLOADS = {
    "transaction-status": {
        "amount": 10000,
        "booking": {"id": "3d38e53b-867a-43bd-ad5d-4af786dd1b33", "booking_reference": "test-123"},
        "completed_at": "2021-11-03T11:04:27.000Z",
        "currency": "GBX",
        "payment_link": {"id": "2cc9b939-d2fa-41e5-abae-39c377236978"},
        "ecommerce": {"id": None},
        "provider": {"name": "nuvei", "reference": "93216A82FBDD1696203B7FC6099A9B66.prod02-vm-tx94"},
        "status": "COMPLETE",
        "transaction": {"id": "2cc9b939-d3fa-41e5-acae-39c377236978"},
        "surcharge": {"surcharge_applied": True, "amount": 100, "currency": "GBX"},
    },
    "refund-status": {
        "authorisation_code": "3d38e53b-867a-43bd-ad5d-4af786dd1b33",
        "actioned_at": "2021-11-03T11:04:27.000Z",
        "amount": 100,
        "metadata": {"internal_id": "abc-1234"},
        "status": {"id": "PENDING_AUTHORISATION"},
        "transaction": {
            "id": "2cc9b939-d3fa-41e5-acae-39c377236978",
            "amount": 100,
            "currency": "GBX",
            "booking": {"booking_reference": "FE123456", "customer_name": "Caroline Rennie"},
        },
    },
    "booking": {
        "booking": {"id": "3d38e53b-867a-43bd-ad5d-4af786dd1b33", "booking_reference": "FE123456"},
        "customer_name": "Caroline Rennie",
        "email": "caroline@example.com",
        "amount": 250000,
        "currency": "GBX",
        "departure_date": "2027-05-01",
        "return_date": "2027-05-14",
        "customer": {"id": "5c2d8e1f-4a6b-4c8d-9e0f-1a2b3c4d5e6f"},
        "created_at": "2026-10-16T11:04:27.000Z",
        "deleted_at": None,
    },
    "user-create": {
        "user": {"id": "4f2b8c91-6d3e-4a75-9b0c-1e2f3a4b5c6d"},
        "email": "caroline@example.com",
        "first_name": "Caroline",
        "last_name": "Rennie",
        "status": "ACTIVE",
        "is_api_user": False,
        "organisation": {"id": "X1234", "name": "Example Travel"},
        "created_at": "2026-10-16T11:04:27.000Z",
    },
}


def sign(body: bytes, secret: str = SECRET) -> str:
    """Felloh: bare hex HMAC-SHA256 of the raw body, keyed with the signing key."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers=None):
    return client.post(
        "/webhooks/felloh",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


class TestValidSignatures:
    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_accepts_delivery(self, name, capsys):
        body = json.dumps(PAYLOADS[name]).encode()
        res = post(body, {"x-signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled Felloh delivery" not in capsys.readouterr().out

    def test_accepts_uppercase_hex(self):
        body = json.dumps(PAYLOADS["booking"]).encode()
        assert post(body, {"x-signature": sign(body).upper()}).status_code == 200

    def test_verifies_exact_bytes_received(self):
        body = json.dumps(PAYLOADS["transaction-status"], indent=2).encode()
        assert post(body, {"x-signature": sign(body)}).status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(PAYLOADS["booking"]).encode()
        res = post(body, {"content-type": "text/plain", "x-signature": sign(body)})
        assert res.status_code == 200

    def test_accepts_test_delivery(self, capsys):
        body = json.dumps(PAYLOADS["transaction-status"]).encode()
        res = post(body, {"x-signature": sign(body), "x-felloh-test": "true"})
        assert res.status_code == 200
        assert "Felloh test delivery" in capsys.readouterr().out

    def test_acknowledges_unknown_shape(self, capsys):
        body = json.dumps({"something": "else"}).encode()
        assert post(body, {"x-signature": sign(body)}).status_code == 200
        assert "Unhandled Felloh delivery" in capsys.readouterr().out


class TestInvalidSignatures:
    body = json.dumps(PAYLOADS["transaction-status"]).encode()

    def test_missing_signature(self):
        assert post(self.body).status_code == 401

    def test_empty_signature(self):
        assert post(self.body, {"x-signature": ""}).status_code == 401

    def test_wrong_key(self):
        assert post(self.body, {"x-signature": sign(self.body, "wrong_key")}).status_code == 401

    def test_tampered_body(self):
        sig = sign(self.body)
        tampered = json.dumps({**PAYLOADS["transaction-status"], "amount": 1}).encode()
        assert post(tampered, {"x-signature": sig}).status_code == 401

    def test_prefixed_signature(self):
        assert post(self.body, {"x-signature": f"sha256={sign(self.body)}"}).status_code == 401

    def test_wrong_length(self):
        assert post(self.body, {"x-signature": sign(self.body)[:62]}).status_code == 401

    def test_non_hex_right_length(self):
        assert post(self.body, {"x-signature": "z" * 64}).status_code == 401

    def test_non_ascii_signature_is_rejected(self):
        # httpx's TestClient can't send non-ASCII header values, so check the verifier directly.
        assert verify_felloh_signature(self.body, "é" * 64) is False

    def test_unconfigured_secret(self):
        assert verify_felloh_signature(self.body, sign(self.body), "") is False


class TestPayloadHandling:
    def test_not_json(self):
        body = b"not json"
        assert post(body, {"x-signature": sign(body)}).status_code == 400

    def test_json_array(self):
        body = json.dumps([1, 2]).encode()
        assert post(body, {"x-signature": sign(body)}).status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"user": "x"},
            {"transaction": "x", "status": "COMPLETE"},
            {"transaction": {"id": 1}, "status": ["a"]},
            {"booking": None},
        ],
    )
    def test_wrong_typed_fields_do_not_500(self, payload):
        body = json.dumps(payload).encode()
        assert post(body, {"x-signature": sign(body)}).status_code == 200


@pytest.mark.parametrize("name", list(PAYLOADS))
def test_classify(name):
    assert classify(PAYLOADS[name]) == name


def test_health():
    assert client.get("/health").status_code == 200
