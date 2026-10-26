import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Katana's token looks like hex but is used as its UTF-8 string.
SECRET = "73f82127d57a2cea"
os.environ["KATANA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Katana: lowercase hex HMAC-SHA256 of the raw body, keyed with the token."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def event(action: str) -> bytes:
    return json.dumps(
        {
            "resource_type": action.split(".")[0],
            "action": action,
            "object": {"id": 12345, "status": "NOT_STARTED", "href": "https://api.katanamrp.com/v1/sales_orders/12345"},
        }
    ).encode()


def send(method: str, body: bytes | None = None, headers: dict | None = None):
    return client.request(method, "/webhooks/katana", content=body, headers=headers or {})


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("KATANA_WEBHOOK_SECRET", SECRET)


@pytest.mark.parametrize(
    "action",
    [
        "sales_order.created",
        "sales_order.delivered",
        "purchase_order.received",
        "manufacturing_order.done",
        "inventory.product_out_of_stock",
    ],
)
def test_accepts_signed_event(action):
    body = event(action)
    res = send("POST", body, {"x-sha2-signature": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_acknowledges_unhandled_events():
    body = event("product.updated")
    assert send("POST", body, {"x-sha2-signature": sign(body)}).status_code == 200


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_accepts_each_method(method):
    body = event("sales_order.created")
    assert send(method, body, {"x-sha2-signature": sign(body)}).status_code == 200


def test_get_with_no_body_is_verified_over_zero_bytes():
    # Valid signature of zero bytes and no event to handle: acknowledged.
    assert send("GET", None, {"x-sha2-signature": sign(b"")}).status_code == 200
    assert send("GET", None, {"x-sha2-signature": sign(b"x")}).status_code == 401


def test_any_content_type():
    body = event("sales_order.created")
    res = send("POST", body, {"content-type": "text/plain", "x-sha2-signature": sign(body)})
    assert res.status_code == 200


def test_accepts_uppercase_hex():
    body = event("sales_order.created")
    assert send("POST", body, {"x-sha2-signature": sign(body).upper()}).status_code == 200


def test_verifies_exact_bytes_not_reserialised_json():
    body = b'{ "action":"sales_order.created",  "object":{"id":1} }'
    assert send("POST", body, {"x-sha2-signature": sign(body)}).status_code == 200
    reformatted = sign(json.dumps(json.loads(body)).encode())
    assert send("POST", body, {"x-sha2-signature": reformatted}).status_code == 401


def test_rejects_missing_signature():
    assert send("POST", event("sales_order.created")).status_code == 401


def test_rejects_empty_signature():
    assert send("POST", event("sales_order.created"), {"x-sha2-signature": ""}).status_code == 401


def test_rejects_wrong_secret():
    body = event("sales_order.created")
    assert send("POST", body, {"x-sha2-signature": sign(body, "someothertoken00")}).status_code == 401


def test_rejects_hex_decoded_key():
    body = event("sales_order.created")
    sig = hmac.new(bytes.fromhex(SECRET), body, hashlib.sha256).hexdigest()
    assert send("POST", body, {"x-sha2-signature": sig}).status_code == 401


def test_rejects_tampered_body():
    body = event("sales_order.created")
    assert send("POST", body.replace(b"12345", b"99999"), {"x-sha2-signature": sign(body)}).status_code == 401


@pytest.mark.parametrize(
    "sig",
    ["abc123", "z" * 64, "sha256=" + "a" * 64, "a" * 66, "a" * 64 + "\n"],
)
def test_rejects_malformed_signature(sig):
    assert send("POST", event("sales_order.created"), {"x-sha2-signature": sig}).status_code == 401


def test_rejects_everything_when_no_secret(monkeypatch):
    monkeypatch.delenv("KATANA_WEBHOOK_SECRET")
    body = event("sales_order.created")
    assert send("POST", body, {"x-sha2-signature": sign(body, "")}).status_code == 401


def test_invalid_json_with_valid_signature():
    body = b"not json"
    assert send("POST", body, {"x-sha2-signature": sign(body)}).status_code == 400
