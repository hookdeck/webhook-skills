import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Spree secret_key values are 64-character hex strings, used as-is (UTF-8) as the HMAC key.
SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
os.environ["SPREE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def now() -> str:
    return str(int(time.time()))


def sign(body: bytes, timestamp: str, key: bytes = SECRET.encode()) -> str:
    """Hex HMAC-SHA256 of "<timestamp>." + raw body"""
    return hmac.new(key, timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def event_payload(name: str, data: dict | None = None) -> bytes:
    return json.dumps(
        {
            "id": "evt_01",
            "name": name,
            "created_at": "2026-10-26T12:00:00Z",
            "data": data or {"id": "or_123"},
            "metadata": {"spree_version": "6.0.0"},
        },
        ensure_ascii=False,
    ).encode("utf-8")


def post(body: bytes, signature=None, timestamp=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Spree-Webhook-Signature"] = signature
    if timestamp is not None:
        headers["X-Spree-Webhook-Timestamp"] = timestamp
    return client.post("/webhooks/spree", content=body, headers=headers)


def signed_post(body: bytes, timestamp: str | None = None, **kwargs):
    timestamp = timestamp or now()
    return post(body, signature=sign(body, timestamp), timestamp=timestamp, **kwargs)


@pytest.fixture(autouse=True)
def _reset_tolerance(monkeypatch):
    monkeypatch.delenv("SPREE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestValidDeliveries:
    @pytest.mark.parametrize(
        "name",
        [
            "order.placed",
            "order.paid",
            "order.canceled",
            "payment.completed",
            "fulfillment.fulfilled",
            "user.created",
            "product.updated",
            "webhook.test",
            "order.some_future_event",
        ],
    )
    def test_returns_200(self, name):
        assert signed_post(event_payload(name)).status_code == 200

    def test_accepts_any_content_type(self):
        assert signed_post(event_payload("order.placed"), content_type="text/plain").status_code == 200

    def test_accepts_uppercase_hex_signature(self):
        body = event_payload("order.placed")
        ts = now()
        assert post(body, signature=sign(body, ts).upper(), timestamp=ts).status_code == 200

    def test_verifies_multibyte_utf8_body_byte_for_byte(self):
        body = event_payload("order.placed", {"id": "or_1", "note": "Café ☃ \U0001f680"})
        assert signed_post(body).status_code == 200

    def test_verifies_body_exactly_as_sent(self):
        body = b"  " + event_payload("order.placed") + b"\n"
        assert signed_post(body).status_code == 200


class TestRejectedDeliveries:
    def test_missing_signature(self):
        assert post(event_payload("order.placed"), timestamp=now()).status_code == 401

    def test_empty_signature(self):
        assert post(event_payload("order.placed"), signature="", timestamp=now()).status_code == 401

    def test_missing_timestamp(self):
        body = event_payload("order.placed")
        assert post(body, signature=sign(body, now())).status_code == 401

    def test_empty_timestamp(self):
        body = event_payload("order.placed")
        assert post(body, signature=sign(body, ""), timestamp="").status_code == 401

    def test_wrong_length_signature(self):
        assert post(event_payload("order.placed"), signature="abc123", timestamp=now()).status_code == 401

    def test_non_hex_signature(self):
        assert post(event_payload("order.placed"), signature="z" * 64, timestamp=now()).status_code == 401

    def test_prefixed_signature(self):
        body = event_payload("order.placed")
        ts = now()
        assert post(body, signature=f"sha256={sign(body, ts)}", timestamp=ts).status_code == 401

    def test_wrong_secret(self):
        body = event_payload("order.placed")
        ts = now()
        assert post(body, signature=sign(body, ts, b"wrong_secret"), timestamp=ts).status_code == 401

    def test_hex_decoded_secret(self):
        body = event_payload("order.placed")
        ts = now()
        signature = sign(body, ts, bytes.fromhex(SECRET))
        assert post(body, signature=signature, timestamp=ts).status_code == 401

    def test_tampered_body(self):
        ts = now()
        signature = sign(event_payload("order.placed"), ts)
        assert post(event_payload("order.canceled"), signature=signature, timestamp=ts).status_code == 401

    def test_timestamp_differs_from_signed(self):
        body = event_payload("order.placed")
        assert post(body, signature=sign(body, now()), timestamp=str(int(now()) + 1)).status_code == 401

    def test_signed_without_timestamp(self):
        body = event_payload("order.placed")
        signature = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        assert post(body, signature=signature, timestamp=now()).status_code == 401

    def test_invalid_json_with_valid_signature(self):
        assert signed_post(b"not json").status_code == 400


class TestTimestampTolerance:
    OLD = str(int(time.time()) - 3600)

    def test_old_timestamp_accepted_by_default(self):
        assert signed_post(event_payload("order.placed"), self.OLD).status_code == 200

    def test_old_timestamp_rejected_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("SPREE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert signed_post(event_payload("order.placed"), self.OLD).status_code == 401

    def test_fresh_timestamp_accepted_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("SPREE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert signed_post(event_payload("order.placed")).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("SPREE_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert signed_post(event_payload("order.placed"), self.OLD).status_code == 200


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
