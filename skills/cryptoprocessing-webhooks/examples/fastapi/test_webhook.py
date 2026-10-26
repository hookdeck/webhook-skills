import hashlib
import hmac
import itertools
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "AbCdEfG123456"
os.environ["CRYPTOPROCESSING_WEBHOOK_SECRET"] = SECRET

from main import app, verify_cryptoprocessing_signature  # noqa: E402

client = TestClient(app)

# Published test vector from the CryptoProcessing docs
DOC_BODY = b'{"currency":"BTC","foreign_id":"123456"}'
DOC_SIG = (
    "03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba5"
    "5b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec"
)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Generate a real signature: lowercase hex HMAC-SHA512 of the raw body."""
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


def post(body: bytes, headers: dict = None, content_type: str = "application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/cryptoprocessing", content=body, headers=h)


_ids = itertools.count(101)


def callback(**overrides) -> bytes:
    """A callback based on the documented deposit payload."""
    payload = {
        "id": next(_ids),
        "end_user_reference": "user_12345",
        "type": "deposit",
        "crypto_address": {
            "id": 1,
            "currency": "USDC",
            "address": "0x9F2E4b7A1C3D5F6E8B0A2C4D6E8F1A3B5C7D9E0F",
            "tag": None,
            "foreign_id": "12345",
        },
        "currency_sent": {"currency": "USDC", "amount": "1000.00000000"},
        "currency_received": {"currency": "USDC", "amount": "1000.00000000", "amount_minus_fee": "997.00000000"},
        "transactions": [],
        "fees": [],
        "error": "",
        "status": "confirmed",
    }
    payload.update(overrides)
    return json.dumps(payload).encode()


class TestVerifyCryptoProcessingSignature:
    def test_accepts_published_test_vector(self):
        assert verify_cryptoprocessing_signature(DOC_BODY, DOC_SIG, "AbCdEfG123456")

    def test_compares_hex_case_insensitively(self):
        assert verify_cryptoprocessing_signature(DOC_BODY, DOC_SIG.upper(), "AbCdEfG123456")

    def test_rejects_tampered_body(self):
        assert not verify_cryptoprocessing_signature(DOC_BODY + b" ", DOC_SIG, "AbCdEfG123456")

    def test_rejects_wrong_secret(self):
        assert not verify_cryptoprocessing_signature(DOC_BODY, DOC_SIG, "abcdefg123456")

    def test_rejects_missing_signature_or_secret(self):
        assert not verify_cryptoprocessing_signature(DOC_BODY, None, "AbCdEfG123456")
        assert not verify_cryptoprocessing_signature(DOC_BODY, "", "AbCdEfG123456")
        assert not verify_cryptoprocessing_signature(DOC_BODY, DOC_SIG, None)

    @pytest.mark.parametrize(
        "bad",
        ["abc", DOC_SIG[:127], DOC_SIG[:127] + "z", "sha512=" + DOC_SIG, DOC_SIG + "0"],
    )
    def test_rejects_malformed_signatures(self, bad):
        assert not verify_cryptoprocessing_signature(DOC_BODY, bad, "AbCdEfG123456")


class TestWebhookEndpoint:
    def test_accepts_published_test_vector_over_http(self):
        assert post(DOC_BODY, {"X-Processing-Signature": DOC_SIG}).status_code == 200

    def test_accepts_valid_deposit_callback(self):
        body = callback()
        res = post(body, {"X-Processing-Key": "master-key", "X-Processing-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize(
        "kind",
        [
            "deposit",
            "withdrawal",
            "exchange",
            "payment_request",
            "deposit_exchange",
            "deposit_wallet_client",
            "withdrawal_exchange",
            "withdrawal_instant",
            "withdrawal_instant_exchange",
            "invoice",
            "some_future_type",
        ],
    )
    def test_accepts_signed_callbacks(self, kind):
        body = callback(type=kind)
        assert post(body, {"X-Processing-Signature": sign(body)}).status_code == 200

    def test_handles_payment_request_without_numeric_id(self):
        body = json.dumps({"payment_request_id": "pr-1", "type": "payment_request", "status": "processing"}).encode()
        assert post(body, {"X-Processing-Signature": sign(body)}).status_code == 200

    def test_answers_duplicate_callback_with_201(self):
        body = callback(id=5000, status="confirmed")
        headers = {"X-Processing-Signature": sign(body)}
        assert post(body, headers).status_code == 200
        assert post(body, headers).status_code == 201

    def test_new_status_of_same_transaction_is_not_a_duplicate(self):
        pending = callback(id=6000, status="pending")
        confirmed = callback(id=6000, status="confirmed")
        assert post(pending, {"X-Processing-Signature": sign(pending)}).status_code == 200
        assert post(confirmed, {"X-Processing-Signature": sign(confirmed)}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = callback()
        res = post(body, {"X-Processing-Signature": sign(body)}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_missing_signature_header(self):
        assert post(callback()).status_code == 401

    def test_rejects_invalid_signature(self):
        body = callback()
        assert post(body, {"X-Processing-Signature": sign(body, "wrong-secret")}).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(callback(), {"X-Processing-Signature": "not-hex"}).status_code == 401

    def test_rejects_body_modified_after_signing(self):
        body = callback()
        tampered = body.replace(b"1000.00000000", b"9999.00000000")
        assert post(tampered, {"X-Processing-Signature": sign(body)}).status_code == 401

    def test_rejects_signed_invalid_json(self):
        bad = b"{not json"
        assert post(bad, {"X-Processing-Signature": sign(bad)}).status_code == 400
