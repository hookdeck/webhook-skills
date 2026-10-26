import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_primary_signature_key"
os.environ["ONSHAPE_WEBHOOK_SECRET"] = SECRET

from main import app, is_timestamp_fresh, verify_onshape_signature  # noqa: E402

client = TestClient(app)

TS = "2024-05-05T23:46:29.284-0500"


def sign(body: bytes, timestamp: str = TS, secret: str = SECRET) -> str:
    """Generate a real Onshape signature: base64 HMAC-SHA256 of "<timestamp>.<raw body>"."""
    message = timestamp.encode("latin-1") + b"." + body
    return base64.b64encode(hmac.new(secret.encode(), message, hashlib.sha256).digest()).decode()


def signed(body: bytes, timestamp: str = TS) -> dict:
    return {
        "X-onshape-webhook-timestamp": timestamp,
        "X-onshape-webhook-signature-primary": sign(body, timestamp),
    }


def post(body: bytes, headers: dict = None, content_type: str = "application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/onshape", content=body, headers=h)


# Payloads as shown in Onshape's webhook docs
Z = "000000000000000000000000"
IDS = {"workspaceId": Z, "elementId": Z, "webhookId": Z, "messageId": Z, "documentId": Z}
EVENTS = {
    "onshape.model.lifecycle.changed": {**IDS, "data": "Some data", "versionId": Z},
    "onshape.model.translation.complete": {**IDS, "data": "Some data", "userId": Z, "translationId": Z},
    "onshape.document.lifecycle.statechange": {**IDS, "data": "Some data", "versionId": Z, "documentState": "TRASH"},
    "onshape.document.lifecycle.created": {**IDS},
    "onshape.revision.created": {**IDS},
    "onshape.comment.create": {**IDS, "commentId": Z},
    "onshape.user.lifecycle.updateappsettings": {**IDS, "userId": Z, "clientId": Z},
    "webhook.register": {**IDS, "data": "Some data", "versionId": Z},
    "webhook.ping": {**IDS, "data": "Some data", "versionId": Z},
    "webhook.unregister": {**IDS},
}


def payload(name: str) -> bytes:
    return json.dumps({"timestamp": TS, "event": name, **EVENTS[name]}).encode()


class TestVerifyOnshapeSignature:
    body = payload("onshape.model.lifecycle.changed")

    def test_accepts_valid_signature(self):
        assert verify_onshape_signature(self.body, TS, sign(self.body), SECRET)

    def test_signs_exact_timestamp_header_value(self):
        assert not verify_onshape_signature(self.body, TS + " ", sign(self.body), SECRET)

    def test_verifies_raw_bytes_that_are_not_utf8(self):
        raw = b'{"a":"\xff\xfe"}'
        assert verify_onshape_signature(raw, TS, sign(raw), SECRET)

    def test_rejects_tampered_body_wrong_secret_and_missing_values(self):
        sig = sign(self.body)
        assert not verify_onshape_signature(self.body + b" ", TS, sig, SECRET)
        assert not verify_onshape_signature(self.body, TS, sig, "other_key")
        assert not verify_onshape_signature(self.body, None, sig, SECRET)
        assert not verify_onshape_signature(self.body, TS, None, SECRET)
        assert not verify_onshape_signature(self.body, TS, "", SECRET)
        assert not verify_onshape_signature(self.body, TS, sig, None)

    def test_rejects_malformed_signatures(self):
        sig = sign(self.body)
        assert not verify_onshape_signature(self.body, TS, sig[:-1], SECRET)
        assert not verify_onshape_signature(self.body, TS, "!" + sig[1:], SECRET)
        assert not verify_onshape_signature(self.body, TS, "sha256=" + sig, SECRET)
        assert not verify_onshape_signature(self.body, TS, sig.lower(), SECRET)
        assert not verify_onshape_signature(self.body, TS, "é" + sig[1:], SECRET)


class TestTimestampFresh:
    now = 1714970789.284  # 2024-05-05T23:46:29.284-0500

    def test_off_by_default(self):
        assert is_timestamp_fresh("2000-01-01T00:00:00.000-0000", 0, self.now)
        assert is_timestamp_fresh("garbage", 0, self.now)

    def test_enforces_window_when_enabled(self):
        assert is_timestamp_fresh(TS, 300, self.now + 60)
        assert not is_timestamp_fresh(TS, 300, self.now + 600)
        assert not is_timestamp_fresh("not a date", 300, self.now)


class TestWebhookEndpoint:
    @pytest.fixture(autouse=True)
    def _clean_env(self, monkeypatch):
        monkeypatch.delenv("ONSHAPE_WEBHOOK_TOLERANCE_SECONDS", raising=False)

    @pytest.mark.parametrize("name", list(EVENTS))
    def test_accepts_signed_event(self, name):
        body = payload(name)
        res = post(body, signed(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = payload("webhook.ping")
        assert post(body, signed(body), content_type="text/plain").status_code == 200

    def test_missing_signature_returns_401(self):
        body = payload("webhook.ping")
        assert post(body, {"X-onshape-webhook-timestamp": TS}).status_code == 401

    def test_missing_timestamp_returns_401(self):
        body = payload("webhook.ping")
        assert post(body, {"X-onshape-webhook-signature-primary": sign(body)}).status_code == 401

    def test_invalid_signature_returns_401(self):
        body = payload("webhook.ping")
        headers = {**signed(body), "X-onshape-webhook-signature-primary": sign(b"{}")}
        assert post(body, headers).status_code == 401

    def test_tampered_body_returns_401(self):
        body = payload("webhook.ping")
        assert post(body + b" ", signed(body)).status_code == 401

    def test_does_not_fall_back_to_secondary_header(self):
        body = payload("webhook.ping")
        headers = {
            "X-onshape-webhook-timestamp": TS,
            "X-onshape-webhook-signature-secondary": sign(body),
        }
        assert post(body, headers).status_code == 401

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, signed(body)).status_code == 400

    def test_old_timestamp_accepted_by_default(self):
        body = payload("webhook.ping")
        assert post(body, signed(body, "2001-01-01T00:00:00.000-0000")).status_code == 200

    def test_old_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("ONSHAPE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = payload("webhook.ping")
        assert post(body, signed(body, "2001-01-01T00:00:00.000-0000")).status_code == 401
