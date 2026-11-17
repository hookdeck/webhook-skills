import hashlib
import hmac
import json
import os
import secrets
import time

import pytest
from fastapi.testclient import TestClient

# Event webhook secret: any string; Chatbase's own sample reads it from SECRET_KEY
os.environ["CHATBASE_WEBHOOK_SECRET"] = "test_chatbase_webhook_secret"
# HIPAA signing secrets are 64-character hex strings, used as-is (UTF-8) as the HMAC key
os.environ["CHATBASE_HIPAA_WEBHOOK_SECRET"] = "a" * 32 + "b" * 32

from main import (  # noqa: E402
    app,
    parse_event_type,
    verify_chatbase_hipaa_signature,
    verify_chatbase_signature,
)

client = TestClient(app)
SECRET = os.environ["CHATBASE_WEBHOOK_SECRET"]
HIPAA_SECRET = os.environ["CHATBASE_HIPAA_WEBHOOK_SECRET"]


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like Chatbase event webhooks: hex(HMAC-SHA1(secret, raw body))."""
    return hmac.new(secret.encode(), body.encode(), hashlib.sha1).hexdigest()


def sign_hipaa(body: str, timestamp: str, secret: str = HIPAA_SECRET) -> str:
    """Sign like the HIPAA webhook: "v1=" + hex(HMAC-SHA256(secret, f"{ts}.{body}"))."""
    return "v1=" + hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


LEAD = {
    "eventType": "leads.submit",
    "chatbotId": "agent_123",
    "payload": {
        "conversationId": "conv_456",
        "customerEmail": "example@chatbase.co",
        "customerName": "Example",
        "customerPhone": "123",
        "customFields": {"Company name": "Acme", "Team size": 12, "utm_source": "google"},
    },
}

PHONE = {
    "eventType": "phone_call.summary",
    "chatbotId": "agent_123",
    "payload": {
        "conversationId": "conv_789",
        "callSummary": "Caller asked about opening hours.",
        "duration": 94,
        "callerNumber": "+14155550100",
        "calledNumber": "+14155550199",
    },
}

FORM = {
    "eventType": "Book demo_custom_form.submit",
    "chatbotId": "agent_123",
    "payload": {"conversationId": "conv_1", "data": {"email": "a@b.co"}, "error": None},
}

COLLECT = {
    "eventType": "Shipping address_collect_data.submit",
    "chatbotId": "agent_123",
    "payload": {"conversationId": "conv_2", "customFields": {"City": "Paris"}},
}

HIPAA = {
    "deliveryId": "b7c1e0a4-3f52-4d81-9a6c-2e4f8d0b1c73",
    "event": "conversation.deleted",
    "deletedAt": "2026-08-17T03:00:00.000Z",
    "deletionReason": "idle_24h",
    "conversation": {
        "id": "d41f8a92-6b3c-4e17-8f5a-9c0d2b7e4a16",
        "chatbotId": "c8e2f1b6-5a94-4d03-b7e8-1f6a3c9d0e52",
        "messages": [{"id": "msg_1", "role": "user", "content": "Hi"}],
    },
}


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["x-chatbase-signature"] = signature
    return client.post("/webhooks/chatbase", content=body, headers=headers)


def post_hipaa(body: str, signature=None, timestamp=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Chatbase-Signature"] = signature
    if timestamp:
        headers["X-Chatbase-Timestamp"] = timestamp
    return client.post("/webhooks/chatbase-hipaa", content=body, headers=headers)


class TestVerifyChatbaseSignature:
    body = json.dumps(LEAD)

    def test_accepts_valid_signature(self):
        assert verify_chatbase_signature(self.body.encode(), sign(self.body), SECRET)

    def test_signature_is_bare_hex(self):
        sig = sign(self.body)
        assert len(sig) == 40 and all(c in "0123456789abcdef" for c in sig)

    def test_rejects_tampered_body(self):
        assert not verify_chatbase_signature(self.body.replace("Example", "Evil").encode(), sign(self.body), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_chatbase_signature(self.body.encode(), sign(self.body, "other_secret"), SECRET)

    def test_rejects_sha256(self):
        sha256 = hmac.new(SECRET.encode(), self.body.encode(), hashlib.sha256).hexdigest()
        assert not verify_chatbase_signature(self.body.encode(), sha256, SECRET)

    def test_rejects_missing_values(self):
        assert not verify_chatbase_signature(self.body.encode(), None, SECRET)
        assert not verify_chatbase_signature(self.body.encode(), sign(self.body), None)


class TestVerifyChatbaseHipaaSignature:
    body = json.dumps(HIPAA)

    def test_accepts_valid_signature(self):
        ts = now()
        assert verify_chatbase_hipaa_signature(self.body.encode(), sign_hipaa(self.body, ts), ts, HIPAA_SECRET) is None

    def test_rejects_missing_prefix_and_body_only(self):
        ts = now()
        assert verify_chatbase_hipaa_signature(self.body.encode(), sign_hipaa(self.body, ts)[3:], ts, HIPAA_SECRET) == "invalid_signature"
        body_only = "v1=" + hmac.new(HIPAA_SECRET.encode(), self.body.encode(), hashlib.sha256).hexdigest()
        assert verify_chatbase_hipaa_signature(self.body.encode(), body_only, ts, HIPAA_SECRET) == "invalid_signature"

    def test_rejects_stale_and_non_numeric_timestamps(self):
        old = str(int(time.time()) - 301)
        assert verify_chatbase_hipaa_signature(self.body.encode(), sign_hipaa(self.body, old), old, HIPAA_SECRET) == "stale_timestamp"
        assert verify_chatbase_hipaa_signature(self.body.encode(), sign_hipaa(self.body, "abc"), "abc", HIPAA_SECRET) == "stale_timestamp"

    def test_missing_headers(self):
        assert verify_chatbase_hipaa_signature(self.body.encode(), None, now(), HIPAA_SECRET) == "missing_headers"
        assert verify_chatbase_hipaa_signature(self.body.encode(), "v1=x", None, HIPAA_SECRET) == "missing_headers"


def test_parse_event_type():
    assert parse_event_type("leads.submit") == {"kind": "leads.submit"}
    assert parse_event_type("phone_call.summary") == {"kind": "phone_call.summary"}
    assert parse_event_type("Book demo_custom_form.submit") == {"kind": "custom_form.submit", "actionName": "Book demo"}
    assert parse_event_type("Shipping address_collect_data.submit") == {
        "kind": "collect_data.submit",
        "actionName": "Shipping address",
    }
    assert parse_event_type("_custom_form.submit") == {"kind": "unknown"}
    assert parse_event_type("something.else") == {"kind": "unknown"}


class TestChatbaseEndpoint:
    def test_missing_signature(self):
        res = post(json.dumps(LEAD))
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing x-chatbase-signature header"

    def test_invalid_signature(self):
        res = post(json.dumps(LEAD), "a" * 40)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    @pytest.mark.parametrize(
        "event,kind",
        [
            (LEAD, "leads.submit"),
            (PHONE, "phone_call.summary"),
            (FORM, "custom_form.submit"),
            (COLLECT, "collect_data.submit"),
        ],
    )
    def test_accepts_signed_events(self, event, kind):
        body = json.dumps(event)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "eventType": event["eventType"], "kind": kind}

    def test_unknown_event_acknowledged(self):
        body = json.dumps({"eventType": "new.event", "chatbotId": "x", "payload": {}})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json()["kind"] == "unknown"

    def test_any_content_type(self):
        body = json.dumps(LEAD)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_signed_non_json(self):
        res = post("not json", sign("not json"), "text/plain")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_missing_secret(self, monkeypatch):
        monkeypatch.delenv("CHATBASE_WEBHOOK_SECRET")
        body = json.dumps(LEAD)
        assert post(body, sign(body)).status_code == 500


class TestChatbaseHipaaEndpoint:
    def test_accepts_signed_delivery(self):
        body = json.dumps(HIPAA)
        ts = now()
        res = post_hipaa(body, sign_hipaa(body, ts), ts)
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "conversation.deleted"}

    def test_acknowledges_signed_probe(self):
        body = json.dumps({**HIPAA, "test": True})
        ts = now()
        res = post_hipaa(body, sign_hipaa(body, ts), ts)
        assert res.status_code == 200
        assert res.json() == {"received": True, "test": True}

    def test_rejects_probe_signed_with_throwaway_key(self):
        body = json.dumps({**HIPAA, "deliveryId": "other", "test": True})
        ts = now()
        res = post_hipaa(body, sign_hipaa(body, ts, secrets.token_hex(32)), ts)
        assert res.status_code == 400
        assert res.json()["detail"] == "invalid_signature"

    def test_missing_headers(self):
        res = post_hipaa(json.dumps(HIPAA))
        assert res.status_code == 400
        assert res.json()["detail"] == "missing_headers"

    def test_stale_timestamp(self):
        body = json.dumps(HIPAA)
        old = str(int(time.time()) - 600)
        res = post_hipaa(body, sign_hipaa(body, old), old)
        assert res.status_code == 400
        assert res.json()["detail"] == "stale_timestamp"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
