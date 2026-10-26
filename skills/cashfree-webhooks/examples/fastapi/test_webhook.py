# Generated with: cashfree-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Cashfree uses the client secret as-is (UTF-8), not a decoded whsec_ value.
SECRET = "cfsk_ma_test_0123456789abcdef0123456789abcdef_01234567"
os.environ["CASHFREE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_cashfree_signature  # noqa: E402

client = TestClient(app)


def sign(raw_body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Cashfree: base64(HMAC-SHA256(timestamp + rawBody, secret))."""
    digest = hmac.new(secret.encode(), timestamp.encode("latin-1") + raw_body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


PAYMENT_SUCCESS = {
    "data": {
        "order": {"order_id": "order_1234", "order_amount": 500.0, "order_currency": "INR", "order_tags": None},
        "payment": {
            "cf_payment_id": 9876543210,
            "payment_status": "SUCCESS",
            "payment_amount": 500.0,
            "payment_currency": "INR",
            "payment_method": {"upi": {"channel": "collect", "upi_id": "user@upi"}},
        },
        "customer_details": {"customer_name": "John Doe", "customer_id": "CUST001"},
    },
    "event_time": "2024-01-15T10:30:05+05:30",
    "type": "PAYMENT_SUCCESS",
}
TRANSFER_SUCCESS = {
    "data": {"transfer_id": "JUNOB2018", "cf_transfer_id": "123456", "status": "SUCCESS", "transfer_amount": 1},
    "event_time": "2024-07-25T17:43:37",
    "type": "TRANSFER_SUCCESS",
}
BANK_VERIFICATION = {
    "event_type": "BANK_ACCOUNT_VERIFICATION_SUCCESS",
    "event_time": "2023-07-19 10:46:16",
    "version": "v2",
    "data": {"reference_id": 1294785793, "account_status": "VALID", "name_at_bank": "John Doe"},
}
PPI_CREDIT = {
    "event_type": "PPI_CREDIT_SUCCESS",
    "event_time": "2006-01-02T15:04:05Z",
    "data": {"credit_id": "CREDIT126345", "wallet_id": "WALLET936721", "amount": 100.5, "status": "SUCCESS"},
}


def ts() -> str:
    return str(int(time.time()))


def post(raw_body, timestamp="default", signature="default", secret=SECRET, content_type="application/json"):
    raw = raw_body if isinstance(raw_body, bytes) else raw_body.encode()
    if timestamp == "default":
        timestamp = ts()
    headers = {"content-type": content_type}
    if timestamp is not None:
        headers["x-webhook-timestamp"] = timestamp
    if signature == "default":
        signature = sign(raw, timestamp or "", secret)
    if signature is not None:
        headers["x-webhook-signature"] = signature
    return client.post("/webhooks/cashfree", content=raw, headers=headers)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CASHFREE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("CASHFREE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


@pytest.mark.parametrize("payload", [PAYMENT_SUCCESS, TRANSFER_SUCCESS, BANK_VERIFICATION, PPI_CREDIT])
def test_valid_delivery_returns_200(payload, capsys):
    res = post(json.dumps(payload))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Unhandled" not in capsys.readouterr().out


def test_verifies_exact_raw_bytes_of_pretty_printed_body():
    assert post(json.dumps(PAYMENT_SUCCESS, indent=4)).status_code == 200


def test_verifies_non_json_content_type():
    assert post(json.dumps(TRANSFER_SUCCESS), content_type="text/plain").status_code == 200


def test_timestamp_first_with_no_separator():
    body = json.dumps(PPI_CREDIT).encode()
    key = SECRET.encode()
    good = sign(body, "1700000000")
    with_dot = base64.b64encode(hmac.new(key, b"1700000000." + body, hashlib.sha256).digest()).decode()
    body_first = base64.b64encode(hmac.new(key, body + b"1700000000", hashlib.sha256).digest()).decode()
    assert verify_cashfree_signature(body, good, "1700000000", SECRET) is None
    assert verify_cashfree_signature(body, with_dot, "1700000000", SECRET) is not None
    assert verify_cashfree_signature(body, body_first, "1700000000", SECRET) is not None


def test_tampered_body_returns_401():
    body = json.dumps(PAYMENT_SUCCESS)
    timestamp = ts()
    res = post(body.replace("500", "900"), timestamp=timestamp, signature=sign(body.encode(), timestamp))
    assert res.status_code == 401


def test_different_timestamp_than_signed_returns_401():
    body = json.dumps(PAYMENT_SUCCESS)
    res = post(body, timestamp="1700000001", signature=sign(body.encode(), "1700000000"))
    assert res.status_code == 401


def test_other_secret_returns_401():
    assert post(json.dumps(PAYMENT_SUCCESS), secret="another_client_secret").status_code == 401


def test_missing_headers_return_401():
    body = json.dumps(PAYMENT_SUCCESS)
    assert post(body, signature=None).status_code == 401
    assert post(body, timestamp=None, signature=sign(body.encode(), "1")).status_code == 401
    assert post(body, signature="").status_code == 401


def test_malformed_signatures_return_401():
    body = json.dumps(PAYMENT_SUCCESS)
    timestamp = ts()
    good = sign(body.encode(), timestamp)
    hex_digest = hmac.new(SECRET.encode(), (timestamp + body).encode(), hashlib.sha256).hexdigest()
    for bad in [hex_digest, good[:-1], good + "=", "sha256=" + good, good[:-2] + "!="]:
        assert post(body, timestamp=timestamp, signature=bad).status_code == 401


def test_base64_is_case_sensitive():
    body = json.dumps(PAYMENT_SUCCESS)
    timestamp = ts()
    assert post(body, timestamp=timestamp, signature=sign(body.encode(), timestamp).lower()).status_code == 401


def test_old_timestamps_are_accepted_by_default():
    assert post(json.dumps(PAYMENT_SUCCESS), timestamp="1500000000").status_code == 200


def test_tolerance_rejects_old_timestamp(monkeypatch):
    monkeypatch.setenv("CASHFREE_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert post(json.dumps(PAYMENT_SUCCESS), timestamp="1500000000").status_code == 401


def test_tolerance_accepts_fresh_seconds_and_milliseconds(monkeypatch):
    monkeypatch.setenv("CASHFREE_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert post(json.dumps(PAYMENT_SUCCESS)).status_code == 200
    assert post(json.dumps(PAYMENT_SUCCESS), timestamp=str(int(time.time() * 1000))).status_code == 200


def test_tolerance_zero_is_off(monkeypatch):
    monkeypatch.setenv("CASHFREE_WEBHOOK_TOLERANCE_SECONDS", "0")
    assert post(json.dumps(PAYMENT_SUCCESS), timestamp="1500000000").status_code == 200


def test_signed_non_json_body_returns_400():
    assert post("not json", content_type="text/plain").status_code == 400


def test_missing_secret_fails_closed(monkeypatch):
    monkeypatch.delenv("CASHFREE_WEBHOOK_SECRET")
    assert post(json.dumps(PAYMENT_SUCCESS)).status_code == 500


def test_unhandled_event_returns_200():
    assert post(json.dumps({"type": "SUBSCRIPTION_STATUS_CHANGED", "data": {}})).status_code == 200
