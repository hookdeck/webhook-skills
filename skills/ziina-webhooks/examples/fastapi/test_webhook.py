import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_ziina_secret"
os.environ["ZIINA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

# Based on the payload shown in Ziina's docs.
PAYMENT_INTENT = {
    "event": "payment_intent.status.updated",
    "data": {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "amount": 1050,
        "tip_amount": 0,
        "vat_amount": 0,
        "currency_code": "AED",
        "created_at": "1712345678901",
        "status": "completed",
        "operation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "settled": {"amount": 1050, "tip_amount": 0, "vat_amount": 0, "currency_code": "AED"},
        "card_details": {"card_last_four": "6789", "card_brand": "mastercard", "card_funding_type": "credit"},
    },
}
REFUND = {"event": "refund.status.updated", "data": {"id": "r-1", "status": "completed"}}


def sign(body: bytes, secret: str = SECRET) -> str:
    """Ziina: lowercase hex HMAC-SHA256 of the raw body, no prefix."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature: str | None = None):
    headers = {"content-type": "application/json"}
    if signature is not None:
        headers["x-hmac-signature"] = signature
    return client.post("/webhooks/ziina", content=body, headers=headers)


def test_valid_payment_intent():
    body = json.dumps(PAYMENT_INTENT).encode()
    assert post(body, sign(body)).status_code == 200


def test_valid_refund():
    body = json.dumps(REFUND).encode()
    assert post(body, sign(body)).status_code == 200


def test_uppercase_hex_accepted():
    body = json.dumps(PAYMENT_INTENT).encode()
    assert post(body, sign(body).upper()).status_code == 200


def test_exact_bytes_verified():
    body = b'{ "event" : "refund.status.updated",\n  "data": {"id":"r-2","status":"completed"} }'
    assert post(body, sign(body)).status_code == 200


def test_unknown_event_accepted():
    body = json.dumps({"event": "something.else", "data": {}}).encode()
    assert post(body, sign(body)).status_code == 200


def test_missing_signature():
    assert post(json.dumps(PAYMENT_INTENT).encode()).status_code == 401


def test_empty_signature():
    assert post(json.dumps(PAYMENT_INTENT).encode(), "").status_code == 401


def test_wrong_secret():
    body = json.dumps(PAYMENT_INTENT).encode()
    assert post(body, sign(body, "other_secret")).status_code == 401


def test_tampered_body():
    body = json.dumps(PAYMENT_INTENT).encode()
    sig = sign(body)
    assert post(body.replace(b"1050", b"9999"), sig).status_code == 401


@pytest.mark.parametrize("make_bad", [
    lambda s: "sha256=" + s,
    lambda s: s[:62],
    lambda s: s + "00",
    lambda s: "zz" + s[2:],
])
def test_prefixed_or_malformed_signature(make_bad):
    body = json.dumps(PAYMENT_INTENT).encode()
    assert post(body, make_bad(sign(body))).status_code == 401


def test_signed_non_json_is_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400
