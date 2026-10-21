import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Lemon Squeezy signing secrets are arbitrary 6-40 character strings (used as-is, not decoded)
SECRET = "test_signing_secret"
os.environ["LEMON_SQUEEZY_SIGNING_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def payload(event_name: str, resource_type: str = "orders") -> bytes:
    return json.dumps(
        {
            "meta": {"event_name": event_name, "custom_data": {"user_id": "42"}},
            "data": {
                "type": resource_type,
                "id": "1",
                "attributes": {"total_formatted": "$11.99", "status": "active", "ends_at": None},
            },
        }
    ).encode()


def send(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/lemon-squeezy",
        content=body,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


EVENTS = [
    "order_created",
    "order_refunded",
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_payment_success",
    "license_key_created",
]


@pytest.mark.parametrize("event_name", EVENTS)
def test_accepts_valid_signature(event_name):
    body = payload(event_name)
    res = send(body, {"X-Event-Name": event_name, "X-Signature": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_falls_back_to_meta_event_name():
    body = payload("order_created")
    res = send(body, {"X-Signature": sign(body)})
    assert res.status_code == 200


def test_accepts_unhandled_event():
    body = payload("customer_updated", "customers")
    res = send(body, {"X-Event-Name": "customer_updated", "X-Signature": sign(body)})
    assert res.status_code == 200


def test_rejects_missing_signature():
    res = send(payload("order_created"), {"X-Event-Name": "order_created"})
    assert res.status_code == 400


def test_rejects_invalid_signature():
    res = send(payload("order_created"), {"X-Signature": "deadbeef"})
    assert res.status_code == 400


def test_rejects_wrong_secret():
    body = payload("order_created")
    res = send(body, {"X-Signature": sign(body, "other_secret")})
    assert res.status_code == 400


def test_rejects_tampered_body():
    body = payload("order_created")
    res = send(body.replace(b"11.99", b"0.01"), {"X-Signature": sign(body)})
    assert res.status_code == 400


def test_rejects_invalid_json_even_when_signed():
    body = b"not json"
    res = send(body, {"X-Signature": sign(body)})
    assert res.status_code == 400
