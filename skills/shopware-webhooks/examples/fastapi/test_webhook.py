import os
import json
import hmac
import hashlib
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment before importing the app
os.environ["SHOPWARE_APP_SECRETS"] = json.dumps({
    "shop-1": "secret_for_shop_1",
    "shop-2": "secret_for_shop_2",
})
os.environ.pop("SHOPWARE_APP_SECRET", None)

from main import app, verify_shopware_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str) -> str:
    """Generate a valid Shopware signature (hex HMAC-SHA256 of the raw body)."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def build_body(event: str, shop_id: str = "shop-1") -> bytes:
    return json.dumps({
        "data": {"payload": [{"entity": "product", "operation": "update", "primaryKey": "abc"}], "event": event},
        "source": {"url": "https://shop.example.com", "appVersion": "1.0.0", "shopId": shop_id, "eventId": "evt_1"},
        "timestamp": int(time.time()),
    }).encode()


def post(body: bytes, headers=None):
    return client.post("/webhooks/shopware", content=body, headers=headers or {})


class TestVerify:
    def test_valid(self):
        assert verify_shopware_webhook(b'{"a":1}', sign(b'{"a":1}', "s"), "s") is True

    def test_invalid_missing_or_wrong_secret(self):
        assert verify_shopware_webhook(b'{"a":1}', "deadbeef", "s") is False
        assert verify_shopware_webhook(b'{"a":1}', None, "s") is False
        assert verify_shopware_webhook(b'{"a":1}', sign(b'{"a":1}', "other"), "s") is False
        assert verify_shopware_webhook(b'{"a":1}', sign(b'{"a":1}', "s"), None) is False


class TestEndpoint:
    @pytest.mark.parametrize("event", [
        "checkout.order.placed",
        "product.written",
        "order.written",
        "customer.written",
        "state_enter.order.state.completed",
        "state_enter.order_transaction.state.paid",
        "some.unknown.event",
    ])
    def test_valid_event(self, event):
        body = build_body(event)
        res = post(body, {"content-type": "application/json", "shopware-shop-signature": sign(body, "secret_for_shop_1")})
        assert res.status_code == 200

    def test_any_content_type(self):
        body = build_body("product.written")
        res = post(body, {"content-type": "text/plain", "shopware-shop-signature": sign(body, "secret_for_shop_1")})
        assert res.status_code == 200

    def test_uses_secret_of_payload_shop(self):
        body = build_body("product.written", "shop-2")
        assert post(body, {"shopware-shop-signature": sign(body, "secret_for_shop_2")}).status_code == 200
        assert post(body, {"shopware-shop-signature": sign(body, "secret_for_shop_1")}).status_code == 401

    def test_invalid_signature(self):
        assert post(build_body("product.written"), {"shopware-shop-signature": "a" * 64}).status_code == 401

    def test_missing_signature(self):
        assert post(build_body("product.written")).status_code == 401

    def test_unknown_shop(self):
        body = build_body("product.written", "unknown-shop")
        assert post(body, {"shopware-shop-signature": sign(body, "secret_for_shop_1")}).status_code == 401

    def test_tampered_body(self):
        body = build_body("product.written")
        res = post(body.replace(b"abc", b"xyz"), {"shopware-shop-signature": sign(body, "secret_for_shop_1")})
        assert res.status_code == 401

    def test_invalid_json(self):
        res = post(b"not json", {"shopware-shop-signature": sign(b"not json", "secret_for_shop_1")})
        assert res.status_code == 400
