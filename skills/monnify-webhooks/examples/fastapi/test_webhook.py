# Generated with: monnify-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "MONNIFYSYNTHETICCLIENTSECRET0001"
os.environ["MONNIFY_CLIENT_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_monnify_signature  # noqa: E402

client = TestClient(app)

BODY = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{"product":{"reference":"SYNTH-ORDER-0001","type":"WEB_SDK"},"transactionReference":"MNFY|20261118101500|000001","paymentReference":"SYNTH-ORDER-0001","paidOn":"2026-11-18 10:15:00.0","paymentDescription":"Synthetic order","amountPaid":"1500.00","totalPayable":"1500.00","paymentMethod":"ACCOUNT_TRANSFER","currency":"NGN","settlementAmount":"1490.00","paymentStatus":"PAID","customer":{"name":"Test Customer","email":"customer@example.com"}}}'
BODY2 = '{"eventType":"SUCCESSFUL_REFUND","eventData":{"transactionReference":"MNFY|20261118101500|000001","refundReference":"SYNTH-REFUND-0001","refundAmount":"1500.00","refundStatus":"COMPLETED"}}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    return "" + hmac.new(key, body.encode("utf-8"), hashlib.sha512).hexdigest()


def sign_other_encoding(body, key=SECRET):
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha512).digest()
    return "" + base64.b64encode(digest).decode()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["monnify-signature"] = signature
    return client.post("/webhooks/monnify", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MONNIFY_CLIENT_SECRET", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_monnify_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_monnify_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_plain_sha512_of_secret_and_body_is_rejected():
    plain = hashlib.sha512((SECRET + BODY).encode()).hexdigest()
    assert not verify_monnify_signature(BODY, plain, SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "SUCCESSFUL_TRANSACTION", "reference": "MNFY|20261118101500|000001"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "SUCCESSFUL_REFUND"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"amountPaid":"1500.00"', '"amountPaid":"15000.00"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MONNIFY_CLIENT_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("MONNIFY_CLIENT_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
