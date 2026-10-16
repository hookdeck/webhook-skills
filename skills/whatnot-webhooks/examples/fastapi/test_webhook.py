# Generated with: whatnot-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Whatnot FastAPI webhook receiver.

Signatures are generated exactly the way Whatnot does: HMAC-SHA256 over the
raw body, lowercase hex. Payloads are ILLUSTRATIVE: Whatnot's docs only show
placeholder values, so the IDs here are made up and are NOT Whatnot's real
Global ID format. Field names and shapes follow the docs for each topic.
"""

import base64
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from main import app, processed_events, verify_whatnot_signature

# Whatnot's secret format isn't documented (a Whatnot representative gives it
# to you), so any string works for tests.
SECRET = "whatnot_test_webhook_secret"

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def whatnot_validate_webhook(raw_request_body, signature, secret):
    """Whatnot's own sample, verbatim from its docs (uses == , not constant-time)."""
    calculated_signature = hmac.new(
        bytes(secret, "utf-8"), bytes(raw_request_body, "utf-8"), hashlib.sha256
    ).hexdigest()
    return calculated_signature == signature


def money(amount: str) -> dict:
    return {"amount": amount, "currency": "USD"}


OBJECTS = {
    "product/sold": {
        "product_id": "example-product-id",
        "listing_id": "example-listing-id",
        "order_id": "example-order-id",
        "external_id": "sku-123",
        "variant_id": None,
        "variant_external_id": None,
        "quantity": 1,
        "product_created_by_client_app_id": None,
    },
    "bulk_operation/finished": {"id": "example-bulk-operation-id", "status": "COMPLETED"},
    "listing/created": {
        "product_id": "example-product-id",
        "listing_id": "example-listing-id",
        "external_id": None,
        "quantity": 5,
        "transaction_type": "BUY_IT_NOW",
        "listing_status": None,
        "condition": None,
        "category_name": None,
        "category_id": None,
    },
    "listing/updated": {
        "product_id": None,
        "listing_id": "example-listing-id",
        "external_id": None,
        "quantity": 4,
        "transaction_type": "AUCTION",
        "listing_status": None,
        "condition": None,
        "category_name": None,
        "category_id": None,
    },
    "order/created": {
        "product_id": "example-product-id",
        "listing_id": "example-listing-id",
        "external_id": None,
        "order_id": "example-order-id",
        "quantity": 1,
        "subtotal": money("20.00"),
        "shipping_price": money("5.00"),
        "taxation": money("1.60"),
        "customs": None,
        "total": money("26.60"),
        "items": [
            {
                "product_id": "example-product-id",
                "listing_id": "example-listing-id",
                "price": money("20.00"),
                "quantity": 1,
                "subtotal": money("20.00"),
                "variant_id": None,
                "variant_external_id": None,
            }
        ],
        "product_created_by_client_app_id": None,
        # With the read_customers scope:
        "shipping_address": {
            "address_line1": "1 Example St",
            "address_line2": None,
            "city": "Los Angeles",
            "state": "CA",
            "postal_code": "90001",
            "country": "US",
        },
        "tracking_info": {"tracking_code": "1Z999", "courier": "UPS", "label_url": "https://example.test/label.pdf"},
        "cancelled_at": None,
    },
    "order/updated": {
        "product_id": "example-product-id",
        "listing_id": "example-listing-id",
        "external_id": None,
        "order_id": "example-order-id",
        "quantity": 1,
        "subtotal": money("20.00"),
        "shipping_price": money("5.00"),
        "taxation": money("1.60"),
        "customs": None,
        "total": money("26.60"),
        "items": [],
        "product_created_by_client_app_id": None,
        # Without the read_customers scope these are null:
        "shipping_address": None,
        "tracking_info": None,
        "cancelled_at": "2026-10-16T12:30:00Z",
    },
    "livestream/created": {"livestream_id": "example-livestream-id", "title": "Friday card breaks", "starts_at": None},
    "livestream/stopped": {"livestream_id": "example-livestream-id"},
    "livestream/product_added": {
        "product_id": "example-product-id",
        "livestream_id": "example-livestream-id",
        "listing_id": "example-listing-id",
        "product_external_id": None,
    },
    "livestream/product_removed": {
        "product_id": "example-product-id",
        "livestream_id": "example-livestream-id",
        "listing_id": "example-listing-id",
        "product_external_id": "sku-123",
    },
    "shipment/label_created": {
        "shipment_id": "example-shipment-id",
        "reason": "label_generated",
        "tracking_code": "9400100000000000000000",
        "courier": "USPS",
        "label_url": None,
        "label_generated_at": "2026-10-16T12:00:00Z",
    },
}


def envelope(topic: str, obj: dict = None) -> bytes:
    event = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "topic": topic,
        "object": OBJECTS[topic] if obj is None else obj,
    }
    return json.dumps(event, separators=(",", ":")).encode()


def send(body: bytes, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-Whatnot-Webhook-Signature"] = signature
    return client.post("/webhooks/whatnot", content=body, headers=all_headers)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("WHATNOT_WEBHOOK_SECRET", SECRET)
    processed_events.clear()


# --- verify_whatnot_signature ------------------------------------------------

# Fixed vector, shared with the Express and Next.js tests.
VECTOR_BODY = '{"id":"00000000-0000-4000-8000-000000000001","timestamp":"2026-10-16T12:00:00Z","topic":"livestream/stopped","object":{"livestream_id":"example-livestream-id"}}'
VECTOR_SIG = "8c8bbd9060c6d9dcf6a7c0e7a29c409cdadbce1aed62394be99726573a19e4eb"


def test_matches_whatnot_sample_and_fixed_vector():
    assert whatnot_validate_webhook(VECTOR_BODY, VECTOR_SIG, SECRET)
    assert sign(VECTOR_BODY.encode()) == VECTOR_SIG
    assert verify_whatnot_signature(VECTOR_BODY.encode(), VECTOR_SIG, SECRET)


def test_agrees_with_whatnot_sample_on_random_bodies():
    for topic in OBJECTS:
        body = envelope(topic)
        sig = sign(body)
        assert whatnot_validate_webhook(body.decode(), sig, SECRET)
        assert verify_whatnot_signature(body, sig, SECRET)


def test_accepts_uppercase_hex():
    assert verify_whatnot_signature(VECTOR_BODY.encode(), VECTOR_SIG.upper(), SECRET)


def test_rejects_wrong_secret():
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), VECTOR_SIG, "other_secret")


def test_rejects_missing_signature_or_secret():
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), None, SECRET)
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), VECTOR_SIG, "")


def test_rejects_base64_digest():
    digest = hmac.new(SECRET.encode(), VECTOR_BODY.encode(), hashlib.sha256).digest()
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), base64.b64encode(digest).decode(), SECRET)


def test_rejects_sha256_prefix():
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), f"sha256={VECTOR_SIG}", SECRET)


def test_rejects_truncated_signature():
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), VECTOR_SIG[:40], SECRET)


def test_rejects_reserialised_json():
    reserialised = json.dumps(json.loads(VECTOR_BODY)).encode()  # Python adds spaces
    assert not verify_whatnot_signature(reserialised, VECTOR_SIG, SECRET)


def test_rejects_timestamp_prefixed_signature():
    with_ts = sign(f"2026-10-16T12:00:00Z.{VECTOR_BODY}".encode())
    assert not verify_whatnot_signature(VECTOR_BODY.encode(), with_ts, SECRET)


# --- Endpoint ----------------------------------------------------------------


@pytest.mark.parametrize("topic", list(OBJECTS))
def test_accepts_signed_event(topic):
    body = envelope(topic)
    res = send(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_reads_seller_id(caplog):
    caplog.set_level(logging.INFO, logger="whatnot-webhooks")
    body = envelope("product/sold")
    res = send(body, sign(body), {"X-Whatnot-Seller-Id": "example-seller-id"})
    assert res.status_code == 200
    assert "(seller example-seller-id)" in caplog.text


def test_order_without_read_customers_data():
    order = {k: v for k, v in OBJECTS["order/created"].items() if k not in ("shipping_address", "tracking_info")}
    body = envelope("order/created", order)
    assert send(body, sign(body)).status_code == 200


def test_unknown_topic_returns_200():
    body = envelope("something/new", {"foo": "bar"})
    assert send(body, sign(body)).status_code == 200


def test_dedupes_retried_event():
    body = envelope("order/created")
    assert send(body, sign(body)).json() == {"received": True}
    assert send(body, sign(body)).json() == {"received": True, "duplicate": True}


def test_missing_signature_returns_400():
    assert send(envelope("product/sold")).status_code == 400


def test_wrong_secret_returns_400():
    body = envelope("product/sold")
    res = send(body, sign(body, "wrong_secret"))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_tampered_body_returns_400():
    body = envelope("order/created")
    assert send(body.replace(b"26.60", b"0.01"), sign(body)).status_code == 400


def test_invalid_json_with_valid_signature_returns_400():
    body = b"not json"
    res = send(body, sign(body))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("WHATNOT_WEBHOOK_SECRET")
    body = envelope("product/sold")
    assert send(body, sign(body)).status_code == 500
