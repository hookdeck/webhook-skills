import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

PRIVATE_KEY = "test_tremendous_private_key"
os.environ["TREMENDOUS_WEBHOOK_PRIVATE_KEY"] = PRIVATE_KEY

from main import app, verify_tremendous_webhook  # noqa: E402

client = TestClient(app)

EVENTS = [
    "REWARDS.DELIVERY.SUCCEEDED", "REWARDS.DELIVERY.FAILED", "REWARDS.CANCELED", "REWARDS.FLAGGED",
    "ORDERS.CREATED", "ORDERS.APPROVED", "ORDERS.CANCELED", "ORDERS.FAILED",
    "CAMPAIGNS.CREATED", "FUNDING_SOURCES.FUNDED", "INVOICES.PAID",
]


def sign(body: bytes, key: str = PRIVATE_KEY) -> str:
    return "sha256=" + hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def payload(event: str) -> bytes:
    return json.dumps(
        {
            "event": event,
            "uuid": "5ccc7bb1-7659-4e23-a407-77d8cd9c62f5",
            "created_utc": "2021-04-06T20:05:01.037-04:00",
            "payload": {"resource": {"id": "2V3PCCL7QXDA", "type": "rewards"}, "meta": {}},
        }
    ).encode()


class TestVerify:
    body = payload("ORDERS.APPROVED")

    def test_valid(self):
        assert verify_tremendous_webhook(self.body, sign(self.body), PRIVATE_KEY) is True

    def test_uppercase_hex(self):
        header = "sha256=" + sign(self.body)[len("sha256="):].upper()
        assert verify_tremendous_webhook(self.body, header, PRIVATE_KEY) is True

    def test_wrong_key(self):
        assert verify_tremendous_webhook(self.body, sign(self.body, "other"), PRIVATE_KEY) is False

    def test_tampered_body(self):
        assert verify_tremendous_webhook(payload("ORDERS.FAILED"), sign(self.body), PRIVATE_KEY) is False

    @pytest.mark.parametrize("header", ["garbage", "sha1=abc", "sha256=", "abc123", "sha256=é", "", None])
    def test_malformed_header(self, header):
        assert verify_tremendous_webhook(self.body, header, PRIVATE_KEY) is False

    def test_missing_prefix(self):
        assert verify_tremendous_webhook(self.body, sign(self.body)[len("sha256="):], PRIVATE_KEY) is False


class TestEndpoint:
    @pytest.mark.parametrize("event", EVENTS)
    def test_accepts_signed_event(self, event):
        body = payload(event)
        res = client.post(
            "/webhooks/tremendous",
            content=body,
            headers={"content-type": "application/json", "tremendous-webhook-signature": sign(body)},
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = payload("ORDERS.CREATED")
        res = client.post(
            "/webhooks/tremendous",
            content=body,
            headers={"content-type": "text/plain", "tremendous-webhook-signature": sign(body)},
        )
        assert res.status_code == 200

    def test_acknowledges_events_without_a_dedicated_case(self):
        body = payload("PRODUCTS.UPDATED")
        res = client.post(
            "/webhooks/tremendous", content=body, headers={"tremendous-webhook-signature": sign(body)}
        )
        assert res.status_code == 200

    def test_invalid_signature(self):
        body = payload("ORDERS.APPROVED")
        res = client.post(
            "/webhooks/tremendous", content=body, headers={"tremendous-webhook-signature": sign(body, "wrong")}
        )
        assert res.status_code == 400

    def test_non_ascii_signature_is_rejected_not_500(self):
        body = payload("ORDERS.APPROVED")
        res = client.post(
            "/webhooks/tremendous",
            content=body,
            headers={"tremendous-webhook-signature": "sha256=é".encode("latin-1")},
        )
        assert res.status_code == 400

    def test_missing_signature(self):
        res = client.post("/webhooks/tremendous", content=payload("ORDERS.APPROVED"))
        assert res.status_code == 400

    def test_signed_invalid_json(self):
        body = b"not json"
        res = client.post(
            "/webhooks/tremendous", content=body, headers={"tremendous-webhook-signature": sign(body)}
        )
        assert res.status_code == 400
