import os
import hmac
import hashlib

os.environ["PAYMOB_HMAC_SECRET"] = "test_hmac_secret"

from fastapi.testclient import TestClient
from main import app, build_signed_string, verify_paymob_hmac, transaction_state

client = TestClient(app)

SECRET = "test_hmac_secret"


def make_obj(**overrides):
    """The signed fields of the transaction in Paymob's HMAC transaction callback
    example (other fields omitted)."""
    obj = {
        "id": 192036465,
        "pending": False,
        "amount_cents": 100000,
        "success": True,
        "is_auth": False,
        "is_capture": False,
        "is_standalone_payment": True,
        "is_voided": False,
        "is_refunded": False,
        "is_3d_secure": True,
        "integration_id": 4097558,
        "has_parent_transaction": False,
        "order": {"id": 217503754},
        "created_at": "2024-06-13T11:33:44.592345",
        "currency": "EGP",
        "source_data": {"pan": "2346", "type": "card", "sub_type": "MasterCard"},
        "error_occured": False,
        "owner": 302852,
    }
    obj.update(overrides)
    return obj


DOC_TRANSACTION_STRING = (
    "1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalse"
    "truefalse217503754302852false2346MasterCardcardtrue"
)

# Paymob's card token callback example, with the HMAC secret and digest its HMAC page prints.
DOC_TOKEN = {
    "type": "TOKEN",
    "obj": {
        "id": 17233884,
        "token": "0c045bd5330aa3d666d72830d4bcf0e60e10902df9fb2340af978bbf",
        "masked_pan": "xxxx-xxxx-xxxx-2346",
        "merchant_id": 164295,
        "card_subtype": "MasterCard",
        "created_at": "2026-11-16T10:44:52.523591",
        "email": "example.test@example.com",
        "order_id": "655608785",
        "user_added": False,
        "next_payment_intention": "pi_test_243ec1d9c065458e8f61adad564d3d10",
        "cardholder_name": "TEST ACCOUNT",
        "expiry_month": "01",
        "expiry_year": "39",
        "card_funding_type": "CREDIT",
    },
}
DOC_TOKEN_SECRET = "04DC1A9490B8CC2094C011FC055ADCDB"
DOC_TOKEN_HMAC = (
    "57982fed57b47d82ddaf9b104a6b75acb35fed1bb629ed29959b88db2699dda5dc7845423a5f58f8"
    "dc6dd794b3727e5fb28b95d896dfce5dd9d3b2845c4a04e4"
)


def sign(callback_type, obj, secret=SECRET):
    return hmac.new(
        secret.encode("utf-8"),
        build_signed_string(callback_type, obj).encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()


def post(body, hmac_value=None):
    return client.post(
        "/webhooks/paymob",
        params={"hmac": hmac_value} if hmac_value is not None else None,
        json=body,
    )


def test_reproduces_doc_transaction_string():
    assert build_signed_string("TRANSACTION", make_obj()) == DOC_TRANSACTION_STRING


def test_verifies_doc_card_token_example():
    assert verify_paymob_hmac(DOC_TOKEN, DOC_TOKEN_HMAC, DOC_TOKEN_SECRET)


def test_accepts_valid_transaction():
    obj = make_obj()
    res = post({"type": "TRANSACTION", "obj": obj}, sign("TRANSACTION", obj))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_valid_card_token():
    res = post(DOC_TOKEN, sign("TOKEN", DOC_TOKEN["obj"]))
    assert res.status_code == 200


def test_rejects_invalid_hmac():
    res = post({"type": "TRANSACTION", "obj": make_obj()}, "deadbeef")
    assert res.status_code == 400


def test_rejects_missing_hmac():
    res = post({"type": "TRANSACTION", "obj": make_obj()})
    assert res.status_code == 400


def test_rejects_tampered_payload():
    valid = sign("TRANSACTION", make_obj())
    res = post({"type": "TRANSACTION", "obj": make_obj(amount_cents=1)}, valid)
    assert res.status_code == 400


def test_rejects_token_signed_with_transaction_keys():
    res = post(DOC_TOKEN, sign("TRANSACTION", DOC_TOKEN["obj"]))
    assert res.status_code == 400


def test_rejects_unknown_type():
    res = post({"type": "SOMETHING_ELSE", "obj": {}}, "abc")
    assert res.status_code == 400


def test_transaction_state():
    assert transaction_state(make_obj()) == "succeeded"
    assert transaction_state(make_obj(success=False, pending=False)) == "declined"
    assert transaction_state(make_obj(success=False, pending=True)) == "pending"
    assert transaction_state(make_obj(is_auth=True, is_capture=False)) == "authorized"
    assert transaction_state(make_obj(is_refunded=True)) == "refunded"
    assert transaction_state(make_obj(is_voided=True)) == "voided"
