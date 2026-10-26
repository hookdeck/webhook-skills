import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["BELCO_WEBHOOK_SECRET"] = "belco_test_webhook_secret"

from main import app, verify_belco_signature  # noqa: E402

SECRET = os.environ["BELCO_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# Shapes from Belco's "Sample payloads" and "Supported events" docs
CREATED = json.dumps({
    "requestId": "NMbsKcBA64MchrKjQ",
    "eventName": "conversation.created",
    "date": "2025-06-11T09:15:09.159Z",
    "payload": {
        "shopId": "G4ag3eGyiKibrGcM7",
        "conversation": {"_id": "sSzxq7tMBFmCY28o8", "channel": "chat", "status": "open"},
        "conversation_item": {"_id": "rxxtPXZng45rALFjE", "type": "message", "body": "test chat"},
    },
}).encode()
CLOSED = json.dumps({
    "requestId": "HjheznXCgdmiuSTYa",
    "eventName": "conversation.closed",
    "date": "2025-06-11T09:18:14.109Z",
    "payload": {
        "shopId": "G4ag3eGyiKibrGcM7",
        "conversation": {"_id": "sSzxq7tMBFmCY28o8", "channel": "chat", "status": "open"},
        "conversation_item": {"_id": "4BJMTqPwP7MDJis6G", "type": "close"},
    },
}).encode()
ANSWERED = json.dumps({
    "requestId": "call-answered-1",
    "eventName": "call.answered",
    "date": "2020-11-12T00:00:00Z",
    "payload": {"shopId": "m5phzRDim8GMsdMhP", "call": {"direction": "inbound", "status": "answered"}},
}).encode()
UNKNOWN = json.dumps({"requestId": "x-1", "eventName": "conversation.snoozed", "payload": {}}).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/belco",
        content=body,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerify:
    def test_valid_including_uppercase(self):
        assert verify_belco_signature(CREATED, sign(CREATED), SECRET)
        assert verify_belco_signature(CREATED, sign(CREATED).upper(), SECRET)

    def test_invalid_variants(self):
        assert not verify_belco_signature(CREATED, sign(CREATED, "other"), SECRET)
        assert not verify_belco_signature(CREATED, "sha256=" + sign(CREATED), SECRET)
        assert not verify_belco_signature(CREATED, None, SECRET)
        assert not verify_belco_signature(CREATED, "", SECRET)
        assert not verify_belco_signature(CREATED, "abcd", SECRET)
        assert not verify_belco_signature(CREATED, "zz" * 32, SECRET)
        assert not verify_belco_signature(CREATED, "é" * 64, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("body", [CREATED, CLOSED, ANSWERED, UNKNOWN])
    def test_signed_event(self, body):
        res = post(body, {"x-hook-signature": sign(body)})
        assert res.status_code == 200
        assert res.json()["received"] is True

    def test_any_content_type(self):
        res = client.post(
            "/webhooks/belco",
            content=CLOSED,
            headers={"Content-Type": "text/plain", "x-hook-signature": sign(CLOSED)},
        )
        assert res.status_code == 200

    def test_duplicate_request_id(self):
        body = json.dumps({"requestId": "dup-1", "eventName": "call.closed", "payload": {"call": {}}}).encode()
        first = post(body, {"x-hook-signature": sign(body)})
        second = post(body, {"x-hook-signature": sign(body)})
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}

    def test_unsigned_rejected(self):
        assert post(CREATED).status_code == 401

    def test_bad_signature_rejected(self):
        assert post(CREATED, {"x-hook-signature": sign(CREATED, "wrong")}).status_code == 401

    def test_malformed_signature_rejected(self):
        assert post(CREATED, {"x-hook-signature": "abc"}).status_code == 401

    def test_tampered_body_rejected(self):
        res = post(CREATED.replace(b"chat", b"mail"), {"x-hook-signature": sign(CREATED)})
        assert res.status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/belco",
            content=CREATED,
            headers={"Content-Type": "application/json", "x-hook-signature": "é".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_malformed_signed_json(self):
        bad = b"{not json"
        assert post(bad, {"x-hook-signature": sign(bad)}).status_code == 400

    @pytest.mark.parametrize("body", [b"null", b"42", b"[1,2]"])
    def test_signed_non_object_body(self, body):
        assert post(body, {"x-hook-signature": sign(body)}).status_code == 400
