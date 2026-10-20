import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Etsy secrets are 'whsec_' + base64-encoded key bytes.
# base64 of "test_etsy_webhook_secret_key"
TEST_SECRET = "whsec_dGVzdF9ldHN5X3dlYmhvb2tfc2VjcmV0X2tleQ=="

client = TestClient(app)

ALL_EVENTS = [
    "order.paid",
    "order.canceled",
    "order.shipped",
    "order.delivered",
    "listing.created",
    "listing.updated",
    "listing.deleted",
    "inventory.created",
    "inventory.updated",
    "inventory.deleted",
    "inventory.out_of_stock",
]


def sign(payload: str, webhook_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Sign exactly as Etsy does: HMAC-SHA256 over "{id}.{timestamp}.{body}", base64."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def msg_id() -> str:
    return "msg_" + secrets.token_hex(12)


def order_payload(event_type: str = "order.paid") -> str:
    return json.dumps(
        {
            "event_type": event_type,
            "resource_url": "https://api.etsy.com/v3/application/shops/12345678/receipts/987654321",
            "shop_id": "12345678",
        }
    )


def post(payload: str, headers: dict):
    return client.post(
        "/webhooks/etsy",
        content=payload,
        headers={"content-type": "application/json", **headers},
    )


def signed_headers(payload: str, timestamp: str = None, secret: str = TEST_SECRET) -> dict:
    webhook_id = msg_id()
    timestamp = timestamp or now()
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(payload, webhook_id, timestamp, secret),
    }


@pytest.fixture(autouse=True)
def etsy_secret(monkeypatch):
    monkeypatch.setenv("ETSY_WEBHOOK_SECRET", TEST_SECRET)


def test_accepts_valid_order_paid():
    payload = order_payload()
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json() == {"received": True, "event_type": "order.paid"}


@pytest.mark.parametrize("event_type", ALL_EVENTS)
def test_handles_each_event(event_type):
    payload = json.dumps(
        {
            "event_type": event_type,
            "resource_url": "https://api.etsy.com/v3/application/shops/12345678/listings/111/products/222",
            "shop_id": "12345678",
            "listing_id": "111",
            "product_id": "222",
        }
    )
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["event_type"] == event_type


def test_accepts_unknown_event_type():
    payload = order_payload("shop.something_new")
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200


def test_accepts_when_one_of_several_signatures_matches():
    payload = order_payload()
    headers = signed_headers(payload)
    headers["webhook-signature"] = "v1,aW52YWxpZHNpZ25hdHVyZQ== " + headers["webhook-signature"]

    response = post(payload, headers)

    assert response.status_code == 200


def test_rejects_missing_headers():
    response = post(order_payload(), {})

    assert response.status_code == 400
    assert "Missing required webhook headers" in response.json()["detail"]


def test_rejects_invalid_signature():
    response = post(
        order_payload(),
        {
            "webhook-id": msg_id(),
            "webhook-timestamp": now(),
            "webhook-signature": "v1,aW52YWxpZHNpZ25hdHVyZQ==",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_other_secret():
    payload = order_payload()
    other_secret = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    response = post(payload, signed_headers(payload, secret=other_secret))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_tampered_body():
    headers = signed_headers(order_payload())
    response = post(order_payload("order.canceled"), headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_stale_timestamp():
    payload = order_payload()
    response = post(payload, signed_headers(payload, timestamp=str(int(time.time()) - 600)))

    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp outside tolerance"


def test_rejects_non_numeric_timestamp():
    payload = order_payload()
    response = post(payload, signed_headers(payload, timestamp="not-a-number"))

    assert response.status_code == 400


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("ETSY_WEBHOOK_SECRET")
    payload = order_payload()
    response = post(payload, signed_headers(payload))

    assert response.status_code == 500


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
