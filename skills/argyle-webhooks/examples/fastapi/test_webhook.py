import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["ARGYLE_WEBHOOK_SECRET"] = "test_argyle_subscription_secret"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_argyle_signature

client = TestClient(app)

SECRET = os.environ["ARGYLE_WEBHOOK_SECRET"]
PATH = "/webhooks/argyle"
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Payloads follow the documented sample (event, name, data with ids).
IDS = {"account": "0187c66e-e7e5-811c-b006-2232f00f426a", "user": "018051aa-f7a9-a0db-2f38-6cfa325e9d69"}
PAYLOADS = {
    "accounts.connected": {"event": "accounts.connected", "name": "name-for-the-webhook-subscription", "data": IDS},
    "gigs.fully_synced": {"event": "gigs.fully_synced", "name": "name-for-the-webhook-subscription", "data": IDS},
    "identities.updated": {"event": "identities.updated", "name": "name-for-the-webhook-subscription", "data": IDS},
    "items.removed": {"event": "items.removed", "name": "name-for-the-webhook-subscription",
                      "data": {"items": ["item_000000001"]}},
}


def sign(body: bytes, secret: str = SECRET) -> str:
    """HMAC-SHA512 over the raw body bytes, bare hex digest, no prefix."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()


def send(method: str, body: bytes = b"", headers=None):
    return client.request(method, PATH, content=body, headers=headers or {})


class TestSignatureVerification:
    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_accepts_validly_signed_event(self, name):
        body = json.dumps(PAYLOADS[name]).encode()
        res = send("POST", body, {"Content-Type": "application/json", "X-Argyle-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_signed_request_for_every_method(self, method):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        res = send(method, body, {"Content-Type": "application/json", "X-Argyle-Signature": sign(body)})
        assert res.status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        body = b'{"event": "accounts.connected",  "data": {}}'  # unusual spacing must survive
        res = send("POST", body, {"Content-Type": "text/plain", "X-Argyle-Signature": sign(body)})
        assert res.status_code == 200

    def test_accepts_uppercase_hex_digest(self):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        res = send("POST", body, {"X-Argyle-Signature": sign(body).upper()})
        assert res.status_code == 200

    def test_get_with_no_body_is_verified_over_zero_bytes(self):
        res = send("GET", b"", {"X-Argyle-Signature": sign(b"")})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_unsigned_get(self):
        assert send("GET").status_code == 401

    def test_rejects_missing_signature(self):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        assert send("POST", body).status_code == 401

    def test_rejects_empty_signature(self):
        assert send("POST", b"{}", {"X-Argyle-Signature": ""}).status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        assert send("POST", body, {"X-Argyle-Signature": sign(body, "another_secret")}).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        res = send("POST", body.replace(b"accounts", b"accountz"), {"X-Argyle-Signature": sign(body)})
        assert res.status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(PAYLOADS["accounts.connected"]).encode()
        good = sign(body)
        for bad in [good[:-2], good + "ab", good[:-1] + "g", "sha512=" + good, good + "zz"]:
            assert send("POST", body, {"X-Argyle-Signature": bad}).status_code == 401

    def test_rejects_non_ascii_signature_without_error(self):
        body = b"{}"
        res = client.post(PATH, content=body, headers={"X-Argyle-Signature": "é".encode("latin-1")})
        assert res.status_code == 401

    def test_returns_400_for_signed_non_json(self):
        body = b"not json"
        assert send("POST", body, {"X-Argyle-Signature": sign(body)}).status_code == 400

    def test_returns_400_for_signed_non_object_json(self):
        body = b"[1,2]"
        assert send("POST", body, {"X-Argyle-Signature": sign(body)}).status_code == 400

    def test_acknowledges_unhandled_event(self):
        body = json.dumps({"event": "example.unhandled", "name": "n", "data": {}}).encode()
        assert send("POST", body, {"X-Argyle-Signature": sign(body)}).status_code == 200


class TestVerifyFunction:
    raw = b'{"event":"accounts.connected"}'

    def test_accepts_bytes_and_rejects_unset_secret(self):
        assert verify_argyle_signature(self.raw, sign(self.raw), SECRET) is True
        assert verify_argyle_signature(self.raw, sign(self.raw), "") is False

    def test_rejects_non_string_signature(self):
        assert verify_argyle_signature(self.raw, None, SECRET) is False
