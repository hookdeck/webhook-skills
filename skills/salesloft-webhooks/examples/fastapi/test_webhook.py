import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# The callback_token is any string you choose when creating the subscription
TOKEN = "test_callback_token"
os.environ["SALESLOFT_CALLBACK_TOKEN"] = TOKEN

from main import app, verify_salesloft_signature  # noqa: E402

client = TestClient(app)

PERSON_CREATED = {"id": "evt-1", "callback_token": TOKEN, "data": {"id": 101}}


def sign(content: bytes, token: str = TOKEN) -> str:
    """Sign like Salesloft: hex(HMAC-SHA1(callback_token, rawBody))."""
    return hmac.new(token.encode(), content, hashlib.sha1).hexdigest()


def post(body: bytes, signature=None, event=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["x-salesloft-signature"] = signature
    if event:
        headers["x-salesloft-event"] = event
    return client.post("/webhooks/salesloft", content=body, headers=headers)


class TestVerifySalesloftSignature:
    def test_accepts_valid_signature(self):
        body = json.dumps(PERSON_CREATED).encode()
        assert verify_salesloft_signature(body, sign(body), TOKEN)

    def test_digest_is_40_char_hex(self):
        assert len(sign(b"{}")) == 40

    def test_rejects_sha256_signature(self):
        body = json.dumps(PERSON_CREATED).encode()
        sha256 = hmac.new(TOKEN.encode(), body, hashlib.sha256).hexdigest()
        assert not verify_salesloft_signature(body, sha256, TOKEN)

    def test_rejects_tampered_body(self):
        body = json.dumps(PERSON_CREATED).encode()
        assert not verify_salesloft_signature(body + b" ", sign(body), TOKEN)

    def test_rejects_wrong_token(self):
        body = json.dumps(PERSON_CREATED).encode()
        assert not verify_salesloft_signature(body, sign(body, "other"), TOKEN)

    def test_rejects_missing_inputs_and_non_ascii(self):
        assert not verify_salesloft_signature(b"{}", None, TOKEN)
        assert not verify_salesloft_signature(b"{}", sign(b"{}"), None)
        assert not verify_salesloft_signature(b"{}", "é" * 40, TOKEN)


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "event",
        [
            "person_created",
            "person_updated",
            "call_created",
            "email_updated",
            "meeting_booked",
            "cadence_membership_created",
        ],
    )
    def test_accepts_signed_event(self, event):
        body = json.dumps(PERSON_CREATED).encode()
        res = post(body, sign(body), event)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(PERSON_CREATED).encode()
        res = post(body, sign(body), "person_created", content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_unknown_event_once_verified(self):
        body = json.dumps(PERSON_CREATED).encode()
        assert post(body, sign(body), "something_new").status_code == 200

    def test_missing_signature_returns_400(self):
        res = post(json.dumps(PERSON_CREATED).encode(), event="person_created")
        assert res.status_code == 400

    def test_invalid_signature_returns_400(self):
        res = post(json.dumps(PERSON_CREATED).encode(), "a" * 40, "person_created")
        assert res.status_code == 400

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body), "person_created").status_code == 400
