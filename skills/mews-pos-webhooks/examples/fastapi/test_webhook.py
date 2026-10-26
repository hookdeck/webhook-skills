import base64
import hashlib
import hmac
import json
import os

import pytest

# Set test environment variables before importing the app
SECRET = "test_mews_pos_secret_key"
os.environ["MEWS_POS_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient

from main import app, verify_mews_pos_signature

client = TestClient(app)


def event(event_type, entity, attributes=None):
    """The documented sample (booking.status.updated) shape, reused for the other events."""
    return {
        "data": {"id": "98656c4a-950d-4b19-b7ef-ad1744e92b53", "type": entity, "attributes": attributes or {}},
        "meta": {"eventType": event_type},
    }


BOOKING = event("booking.status.updated", "bookings", {"status": "seated", "updatedAt": "2025-02-06T09:41:30.465Z"})
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Mews: Base64.strict_encode64(HMAC-SHA256(secret, body))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def non_canonical(signature: str) -> str:
    """Same bytes, different Base64 string: flip the low bit of the final character's data bits."""
    return signature[:42] + ALPHABET[ALPHABET.index(signature[42]) ^ 1] + "="


def post(body, headers=None, content_type="application/json"):
    content = body if isinstance(body, (bytes, str)) else json.dumps(body)
    return client.post(
        "/webhooks/mews-pos",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def signed_post(body, content_type="application/json"):
    content = (body if isinstance(body, (bytes, str)) else json.dumps(body))
    raw = content.encode() if isinstance(content, str) else content
    return post(raw, {"X-Signature": sign(raw)}, content_type)


class TestMewsPosWebhook:
    def test_accepts_signed_booking_status_updated(self, capsys):
        res = signed_post(BOOKING)
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "status: seated" in capsys.readouterr().out

    @pytest.mark.parametrize(
        "evt",
        [
            event("order.state.updated", "orders"),
            event("order.status.updated", "orders", {"status": "Open"}),
            event("order.total.updated", "orders"),
            event("order.payments.added", "orders", {"amount": 12.5}),
            event("product.availability.updated", "products", {"available": False}),
        ],
    )
    def test_accepts_other_events(self, evt):
        assert signed_post(evt).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        assert signed_post(BOOKING, "text/plain").status_code == 200

    def test_logs_and_accepts_unknown_events(self, capsys):
        assert signed_post(event("order.something.new", "orders")).status_code == 200
        assert "Unhandled Mews POS event: order.something.new" in capsys.readouterr().out

    def test_rejects_missing_signature(self):
        assert post(json.dumps(BOOKING)).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(json.dumps(BOOKING), {"X-Signature": ""}).status_code == 401

    def test_rejects_wrong_secret(self):
        raw = json.dumps(BOOKING).encode()
        assert post(raw, {"X-Signature": sign(raw, "wrong-secret")}).status_code == 401

    def test_rejects_tampered_body(self):
        signature = sign(json.dumps(BOOKING).encode())
        tampered = json.dumps(event("booking.status.updated", "bookings", {"status": "left"}))
        assert post(tampered, {"X-Signature": signature}).status_code == 401

    def test_rejects_signature_over_reserialised_json(self):
        pretty = json.dumps(BOOKING, indent=2)
        assert post(pretty, {"X-Signature": sign(json.dumps(BOOKING).encode())}).status_code == 401

    def test_rejects_malformed_signatures(self):
        raw = json.dumps(BOOKING).encode()
        good = sign(raw)
        for bad in [good[:43], good + "A", good.rstrip("="), good.lower(), f"sha256={good}", good[:20] + "-" + good[21:]]:
            assert post(raw, {"X-Signature": bad}).status_code == 401

    def test_rejects_non_canonical_base64_of_same_digest(self):
        raw = json.dumps(BOOKING).encode()
        good = sign(raw)
        bad = non_canonical(good)
        assert base64.b64decode(bad, validate=True) == base64.b64decode(good, validate=True)
        assert post(raw, {"X-Signature": bad}).status_code == 401

    def test_returns_400_for_signed_non_json(self):
        assert signed_post("not json").status_code == 400

    @pytest.mark.parametrize(
        "body",
        [
            "[]",
            '"hello"',
            json.dumps({"data": BOOKING["data"]}),
            json.dumps({"data": BOOKING["data"], "meta": "x"}),
            json.dumps({"data": BOOKING["data"], "meta": {"eventType": 5}}),
        ],
    )
    def test_returns_400_for_wrong_shapes(self, body):
        assert signed_post(body).status_code == 400

    @pytest.mark.parametrize("data", ["x", None, [], {"id": 5, "attributes": "y"}])
    def test_ignores_wrong_typed_data_fields(self, data):
        assert signed_post({"data": data, "meta": {"eventType": "booking.status.updated"}}).status_code == 200

    def test_fails_closed_without_secret(self):
        raw = b"{}"
        assert verify_mews_pos_signature(raw, sign(raw), "") is False
