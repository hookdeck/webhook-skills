# Generated with: qlik-cloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Qlik Cloud webhook receiver.

Signed exactly as Qlik Cloud signs: lowercase hex HMAC-SHA256 of the raw body bytes,
keyed with the secret's UTF-8 bytes.
"""

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_qlik_signature

# Qlik Cloud secrets are 32-64 characters, used as UTF-8 bytes (not decoded).
SECRET = "qlik-test-secret-0123456789abcdefghijklmn"
URL = "/webhooks/qlik-cloud"
JSON_HEADERS = {"content-type": "application/json"}

# Payloads as shown in Qlik's docs (qlik.dev/apis/event)
RELOAD_FINISHED = {
    "id": "b347fd0d-1321-417f-91ee-90e96c76389c",
    "time": "2018-10-30T07:06:22Z",
    "type": "com.qlik.v1.reload.finished",
    "source": "com.qlik/reloads",
    "specversion": "1.0",
    "datacontenttype": "application/json",
    "tenantid": "UkeLb6ICti8OA8f3LueRI5kVNtuHc15f",
    "data": {
        "id": "6a849f7f18ec290e6ceb025d",
        "appId": "002ff8c5-3c11-4464-a22b-68fb5e7ee5e8",
        "userId": "5be59decca62aa00097268a4",
        "succeeded": True,
    },
}
CHANGE_STORE_SAVED = {
    "id": "id123",
    "type": "com.qlik.analytics.change-store.changes.saved",
    "source": "com.qlik/write-table",
    "specversion": "1.0",
    "data": {"storeId": "store012", "spaceId": "space123", "committedAt": "2024-01-01T12:20:00Z"},
}
# Pre-hybrid payload (the help page's example): only eventType, data.attributes
LEGACY_APP_DELETED = {
    "cloudEventsVersion": "0.1",
    "source": "com.qlik/engine",
    "eventId": "e65c1481-e8a-4be-a5ca-27dfcde077d7",
    "eventType": "com.qlik.v1.app.deleted",
    "data": {"attributes": {"id": "0984fec4-aa8c-4253-b1d1-4fd4f9c78", "name": "New App"}},
}


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def body_of(payload, **kwargs) -> bytes:
    return json.dumps(payload, **kwargs).encode("utf-8")


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("QLIK_CLOUD_WEBHOOK_SECRET", SECRET)


client = TestClient(app)


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["qlik-signature"] = signature
    return client.post(URL, content=body, headers=headers)


class TestVerifyQlikSignature:
    body = body_of(RELOAD_FINISHED)

    def test_accepts_lowercase_and_uppercase_hex(self):
        assert verify_qlik_signature(self.body, sign(self.body), SECRET)
        assert verify_qlik_signature(self.body, sign(self.body).upper(), SECRET)

    def test_verifies_over_zero_bytes(self):
        assert verify_qlik_signature(b"", sign(b""), SECRET)

    def test_rejects_missing_or_empty(self):
        assert not verify_qlik_signature(self.body, None, SECRET)
        assert not verify_qlik_signature(self.body, "", SECRET)

    def test_rejects_wrong_length_alphabet_or_prefix(self):
        good = sign(self.body)
        assert not verify_qlik_signature(self.body, good[:63], SECRET)
        assert not verify_qlik_signature(self.body, good + "0", SECRET)
        assert not verify_qlik_signature(self.body, "z" * 64, SECRET)
        assert not verify_qlik_signature(self.body, "sha256=" + good, SECRET)
        assert not verify_qlik_signature(self.body, good + "\n", SECRET)
        assert not verify_qlik_signature(self.body, "é" * 64, SECRET)  # non-ASCII: no exception

    def test_rejects_other_secret_other_bytes_and_unconfigured(self):
        assert not verify_qlik_signature(self.body, sign(self.body, "x" * 40), SECRET)
        assert not verify_qlik_signature(body_of(RELOAD_FINISHED, indent=2), sign(self.body), SECRET)
        assert not verify_qlik_signature(self.body, sign(self.body), "")


class TestPost:
    def test_accepts_signed_events(self):
        for payload in (RELOAD_FINISHED, CHANGE_STORE_SAVED, LEGACY_APP_DELETED):
            body = body_of(payload)
            res = post(body, sign(body))
            assert res.status_code == 200
            assert res.json() == {"received": True}

    def test_verifies_exact_bytes(self):
        compact = body_of(RELOAD_FINISHED)
        pretty = body_of(RELOAD_FINISHED, indent=2)
        assert post(pretty, sign(compact)).status_code == 401
        assert post(pretty, sign(pretty)).status_code == 200

    def test_accepts_any_content_type(self):
        body = body_of(RELOAD_FINISHED)
        assert post(body, sign(body), "text/plain").status_code == 200
        assert post(body, sign(body), "application/cloudevents+json").status_code == 200

    def test_rejects_missing_malformed_or_wrong_signature(self):
        body = body_of(RELOAD_FINISHED)
        assert post(body).status_code == 401
        assert post(body, "").status_code == 401
        assert post(body, "abc").status_code == 401
        assert post(body, sign(body, "y" * 40)).status_code == 401

    def test_rejects_body_changed_after_signing(self):
        body = body_of(RELOAD_FINISHED)
        assert post(body.replace(b"true", b"false"), sign(body)).status_code == 401

    def test_400_for_verified_body_that_is_not_a_json_object(self):
        assert post(b"not json", sign(b"not json"), "text/plain").status_code == 400
        assert post(b"[1,2]", sign(b"[1,2]")).status_code == 400

    def test_verifies_non_utf8_bytes_as_bytes(self):
        raw = bytes([0xFF, 0xFE, 0x00, 0x80])
        assert post(raw, sign(raw), "application/octet-stream").status_code == 400  # verified, not JSON

    @pytest.mark.parametrize(
        "payload",
        [
            {"type": 42, "data": "x"},
            {"type": "com.qlik.v1.reload.finished", "data": [1, 2]},
            {"type": "com.qlik.v1.app.deleted", "data": {"attributes": "nope", "id": 7}},
            {"eventType": {"a": 1}, "data": None},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, payload):
        body = body_of(payload)
        assert post(body, sign(body)).status_code == 200

    def test_500_when_secret_not_set(self, monkeypatch):
        monkeypatch.delenv("QLIK_CLOUD_WEBHOOK_SECRET")
        body = body_of(RELOAD_FINISHED)
        assert post(body, sign(body)).status_code == 500


class TestOtherMethods:
    def test_signed_get_without_body_is_acknowledged(self):
        res = client.get(URL, headers={"qlik-signature": sign(b"")})
        assert res.status_code == 200

    def test_unsigned_get_is_rejected(self):
        assert client.get(URL).status_code == 401

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_signed_put_patch_delete_with_body(self, method):
        body = body_of(RELOAD_FINISHED)
        res = client.request(method, URL, content=body, headers={**JSON_HEADERS, "qlik-signature": sign(body)})
        assert res.status_code == 200
