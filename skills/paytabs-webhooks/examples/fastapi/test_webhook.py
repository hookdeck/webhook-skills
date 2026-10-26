import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_profile_server_key_0123456789"
os.environ["PAYTABS_WEBHOOK_SECRET"] = SECRET

from main import app, verify_paytabs_signature  # noqa: E402

client = TestClient(app)

# Payload as shown in the PayTabs docs (a declined Sale)
TRANSACTION = {
    "tran_ref": "TST2234801409691",
    "merchant_id": 31237,
    "profile_id": 81784,
    "cart_id": "cart_11111",
    "cart_currency": "EGP",
    "cart_amount": "500.00",
    "tran_currency": "EGP",
    "tran_total": "500.00",
    "tran_type": "Sale",
    "tran_class": "ECom",
    "customer_details": {"name": "Mohammed EL Rayes", "email": "mohammed.elrayes@paytabs.com", "country": "EG"},
    "payment_result": {
        "response_status": "D",
        "response_code": "344",
        "response_message": "Acquirer is unable to process this request",
        "transaction_time": "2022-12-14T15:53:58Z",
    },
    "payment_info": {"payment_method": "Visa", "card_type": "Credit", "card_scheme": "Visa"},
    "ipn_trace": "IPNS0004.6399F196.00000FD3",
}

# Published vector from the PayTabs signature article (the Return URL worked example).
# The body is the canonical string PayTabs hashes there; it exercises the same
# HMAC-SHA256 / lowercase hex primitive, with the exact bytes below.
VECTOR_SECRET = "SGJNZ96JLG-JDMKHGRWT9-RWRK2KJNRJ"
VECTOR_BODY = (
    b"cartId=cart_11111&customerEmail=email%40domain.com&respCode=G84718"
    b"&respMessage=Authorised&respStatus=A&tranRef=TST2215201242166"
)
VECTOR_SIGNATURE = "7a181a32c768621eb6966107752ee70205a01f1c4403a3d13c0ff604f591f988"


def payload(**overrides) -> bytes:
    return json.dumps({**TRANSACTION, **overrides}).encode()


def authorised(**overrides) -> bytes:
    result = {**TRANSACTION["payment_result"], "response_status": "A", "response_message": "Authorised"}
    return payload(payment_result=result, **overrides)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as PayTabs: hex(HMAC-SHA256(raw_body, profile ServerKey))."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature: str | bytes | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Signature"] = signature
    return client.post("/webhooks/paytabs", content=body, headers=headers)


class TestVerifyPayTabsSignature:
    def test_published_vector(self):
        assert verify_paytabs_signature(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_SECRET)

    def test_valid_digest_in_either_case(self):
        body = payload()
        assert verify_paytabs_signature(body, sign(body), SECRET)
        assert verify_paytabs_signature(body, sign(body).upper(), SECRET)

    @pytest.mark.parametrize(
        "header",
        ["", "abcd", "z" * 64, "é" * 64, "sha256=" + "a" * 64, None],
    )
    def test_malformed_values_are_rejected(self, header):
        assert not verify_paytabs_signature(payload(), header, SECRET)

    def test_longer_digest_is_rejected(self):
        body = payload()
        assert not verify_paytabs_signature(body, sign(body) + "00", SECRET)

    def test_wrong_or_missing_secret(self):
        body = payload()
        assert not verify_paytabs_signature(body, sign(body, "other_key"), SECRET)
        assert not verify_paytabs_signature(body, sign(body), None)


class TestWebhookEndpoint:
    def test_valid_signature_and_documented_payload(self):
        body = payload()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_exact_bytes_not_reserialized(self):
        body = json.dumps(TRANSACTION, indent=4).encode()
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = payload()
        assert post(body, sign(body), "text/plain").status_code == 200

    @pytest.mark.parametrize(
        "body",
        [authorised(), authorised(tran_type="Refund"), authorised(tran_type="Auth"), payload()],
    )
    def test_handles_transactions(self, body):
        assert post(body, sign(body)).status_code == 200

    def test_missing_or_empty_signature_returns_401(self):
        body = payload()
        assert post(body).status_code == 401
        assert post(body, "").status_code == 401

    def test_malformed_signature_returns_401(self):
        body = payload()
        assert post(body, "nothex").status_code == 401
        assert post(body, sign(body)[:62]).status_code == 401

    def test_wrong_key_returns_401(self):
        body = payload()
        assert post(body, sign(body, "other_key")).status_code == 401

    def test_tampered_body_returns_401(self):
        signed = payload()
        tampered = payload(tran_total="1.00")
        assert post(tampered, sign(signed)).status_code == 401

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    @pytest.mark.parametrize("body", [b"[]", b"null", b'"text"', b"42"])
    def test_signed_non_object_returns_400(self, body):
        assert post(body, sign(body)).status_code == 400

    @pytest.mark.parametrize(
        "data",
        [
            {"tran_type": 123, "payment_result": "x"},
            {"tran_type": "Sale", "payment_result": ["A"]},
            {"tran_type": "Sale", "payment_result": {"response_status": 5}, "tran_ref": 9},
            {"tran_type": ["Sale"], "payment_result": None},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, data):
        body = json.dumps(data).encode()
        assert post(body, sign(body)).status_code == 200
