"""Tests for the Hyperswitch webhook handler.

Signatures are generated the way Hyperswitch does: HMAC-SHA512 over the raw
body, keyed with the UTF-8 secret, lowercase hex digest, no prefix.
"""

import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# payment_response_hash_key is used as UTF-8 bytes (not hex- or base64-decoded).
# Set it BEFORE importing the app.
SECRET = "hyperswitch_test_payment_response_hash_key"
os.environ["HYPERSWITCH_WEBHOOK_SECRET"] = SECRET

from main import (  # noqa: E402
    KNOWN_EVENT_TYPES,
    app,
    processed_event_ids,
    verify_hyperswitch_signature,
)

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()


def post(body: bytes, signature="auto", content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature == "auto":
        signature = sign(body)
    if signature is not None:
        headers["X-Webhook-Signature-512"] = signature
    return client.post("/webhooks/hyperswitch", content=body, headers=headers)


def event_body(event_type: str, event_id: str = None) -> bytes:
    return json.dumps(
        {
            "merchant_id": "merchant_1",
            "event_id": event_id or f"evt_{event_type}",
            "event_type": event_type,
            "content": {"type": "payment_details", "object": {"payment_id": "pay_123"}},
            "timestamp": "2026-10-26T10:00:00.000Z",
        }
    ).encode()


@pytest.fixture(autouse=True)
def clear_dedupe():
    processed_event_ids.clear()


def test_has_33_documented_event_types():
    assert len(KNOWN_EVENT_TYPES) == 33


class TestSignatureVerification:
    def test_valid_signature(self):
        res = post(event_body("payment_succeeded"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_uppercase_hex_digest(self):
        body = event_body("payment_succeeded")
        assert post(body, sign(body).upper()).status_code == 200

    def test_any_content_type(self):
        body = event_body("payment_succeeded")
        assert post(body, content_type="text/plain").status_code == 200

    def test_exact_bytes_with_odd_whitespace(self):
        body = b'{ "event_id": "evt_ws",   "event_type": "payment_succeeded" }'
        assert post(body).status_code == 200

    def test_missing_and_empty_signature(self):
        body = event_body("payment_succeeded")
        assert post(body, None).status_code == 401
        assert post(body, "").status_code == 401

    def test_wrong_secret(self):
        body = event_body("payment_succeeded")
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_tampered_body(self):
        body = event_body("payment_succeeded")
        assert post(body.replace(b"pay_123", b"pay_999"), sign(body)).status_code == 401

    def test_sha256_digest_rejected(self):
        body = event_body("payment_succeeded")
        sha256 = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        assert post(body, sha256).status_code == 401

    def test_prefixed_or_non_hex_signature_rejected(self):
        body = event_body("payment_succeeded")
        assert post(body, f"sha512={sign(body)}").status_code == 401
        assert post(body, "z" * 128).status_code == 401

    def test_secret_is_utf8_not_hex_decoded(self):
        body = event_body("payment_succeeded")
        # A digest made with some hex-decoded key is not the UTF-8-keyed digest.
        other = hmac.new(bytes.fromhex("ab" * 32), body, hashlib.sha512).hexdigest()
        assert post(body, other).status_code == 401

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("HYPERSWITCH_WEBHOOK_SECRET")
        assert post(event_body("payment_succeeded")).status_code == 500

    def test_verify_function_directly(self):
        body = b'{"event_type":"payment_succeeded"}'
        assert verify_hyperswitch_signature(body, sign(body), SECRET)["valid"] is True
        assert verify_hyperswitch_signature(body, sign(body)[1:], SECRET)["valid"] is False


class TestPayloadHandling:
    def test_signed_non_json_body(self):
        assert post(b"not json").status_code == 400

    def test_signed_json_array_body(self):
        assert post(b"[1,2]").status_code == 400

    @pytest.mark.parametrize("event_type", sorted(KNOWN_EVENT_TYPES))
    def test_acknowledges_every_documented_event(self, event_type):
        assert post(event_body(event_type)).status_code == 200

    def test_acknowledges_unknown_event(self):
        assert post(event_body("some_future_event")).status_code == 200

    def test_duplicate_event_id(self):
        body = event_body("payment_succeeded", "evt_dup")
        assert post(body).json() == {"received": True}
        assert post(body).json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
