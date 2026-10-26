# Generated with: sent-dm-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Sent secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"sent-test-signing-key-0123456789").decode()
WEBHOOK_ID = "4f0f7a3e-9dad-11d1-80b4-00c04fd430c8"  # the webhook's id, constant across events

os.environ["SENT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Sent: v1,base64(HMAC-SHA256(key, "{id}.{ts}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, hook_id=WEBHOOK_ID, event_id=None, timestamp=None, secret=SECRET,
                   signature=None, content_type="application/json"):
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "x-webhook-id": hook_id,
        "x-webhook-event-id": event_id or str(uuid.uuid4()),
        "x-webhook-timestamp": ts,
        "x-webhook-attempt": "1",
        "x-webhook-signature": signature or sign(raw_body, hook_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/sent-dm", content=raw_body, headers=headers)


# Payloads follow Sent's documented examples (docs.sent.dm/start/webhooks/event-types).
def message_delivered() -> dict:
    return {
        "field": "message",
        "event": "message.delivered",
        "timestamp": "2025-10-31T10:10:42Z",
        "payload": {
            "updated_at": "2025-10-31T10:10:41Z",
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "message_id": "8ba7b830-9dad-11d1-80b4-00c04fd430c8",
            "template_id": "9ba7b840-9dad-11d1-80b4-00c04fd430c8",
            "template_name": "order_confirmation",
            "outbound_number": "+1987654321",
            "agent_id": "agent_abc123",
            "message_status": "DELIVERED",
            "channel": "sms",
            "body": "Hi Jane, your order has been confirmed.",
        },
    }


def message_failed() -> dict:
    return {
        "field": "message",
        "event": "message.failed",
        "timestamp": "2025-10-31T12:15:42Z",
        "payload": {
            "updated_at": "2025-10-31T12:15:42Z",
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "message_id": "8ba7b830-9dad-11d1-80b4-00c04fd430c8",
            "template_id": "9ba7b840-9dad-11d1-80b4-00c04fd430c8",
            "outbound_number": "+1987654321",
            "message_status": "FAILED",
            "channel": "sms",
            "body": "Hi Jane, your order has been confirmed.",
            "reason_code": "DELIVERY_013",
            "reason": "The carrier rejected the message",
        },
    }


def message_received() -> dict:
    return {
        "field": "message",
        "event": "message.received",
        "timestamp": "2025-10-31T10:10:42Z",
        "payload": {
            "message_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            "updated_at": "2025-10-31T10:10:40Z",
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "inbound_number": "+1234567890",
            "outbound_number": "+1987654321",
            "text": "Hello, I have a question about my order",
            "channel": "sms",
            "received_at": "2025-10-31T10:10:40Z",
        },
    }


def template_approved() -> dict:
    return {
        "field": "templates",
        "event": "templates.approved",
        "timestamp": "2025-10-31T12:18:14Z",
        "payload": {
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "template_id": "9ba7b840-9dad-11d1-80b4-00c04fd430c8",
            "template_name": "order_confirmation",
            "whatsapp_template_id": "1234567890123456",
            "status": "APPROVED",
            "language": "en_US",
            "category": "UTILITY",
            "channel": "whatsapp",
        },
    }


def contact_opt_out() -> dict:
    return {
        "field": "contact",
        "event": "contact.opt_out",
        "timestamp": "2026-09-24T14:00:00Z",
        "request_id": "req_9Y0aLq3kEx",
        "payload": {
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "contact_id": "a1b2c3d4-9dad-11d1-80b4-00c04fd430c8",
            "from": "+14155551234",
            "to": "+18005550100",
            "opt_out": True,
            "source": "INBOUND_KEYWORD",
            "channel": "sms",
            "text": "STOP",
            "message_id": "8ba7b830-9dad-11d1-80b4-00c04fd430c8",
        },
    }


def channel_activated() -> dict:
    return {
        "field": "channel",
        "event": "channel.activated",
        "timestamp": "2025-10-31T14:22:09Z",
        "request_id": "req_7X9zKp2jDw",
        "payload": {
            "channel": "sms",
            "status": "ACTIVE",
            "account_id": "7ba7b820-9dad-11d1-80b4-00c04fd430c8",
            "country": "XK",
            "number_type": "ALPHANUMERIC",
            "sender_value": "SENTDM",
            "updated_at": "2025-10-31T14:22:09Z",
        },
    }


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("SENT_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    @pytest.mark.parametrize(
        "build,logged",
        [
            (message_delivered, "Message delivered"),
            (message_failed, "Message failed"),
            (message_received, "Inbound message from +1234567890"),
            (template_approved, "Template order_confirmation APPROVED"),
            (contact_opt_out, "Contact opted out"),
            (channel_activated, "Channel activated"),
        ],
    )
    def test_accepts_event(self, build, logged, caplog):
        body = json.dumps(build())
        with caplog.at_level(logging.INFO, logger="sent-dm-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert logged in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        body = json.dumps({"field": "link", "event": "link.clicked", "timestamp": "2025-10-31T15:04:02Z", "payload": {}})
        with caplog.at_level(logging.INFO, logger="sent-dm-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Sent event: link.clicked" in caplog.text

    def test_verifies_any_content_type(self):
        body = json.dumps(message_delivered())
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_accepts_any_of_several_signatures(self):
        body = json.dumps(message_delivered())
        headers = signed_headers(body)
        headers["x-webhook-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['x-webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_dedupes_on_event_id_not_webhook_id(self):
        body = json.dumps(message_delivered())
        event_id = str(uuid.uuid4())
        first = post(body, signed_headers(body, event_id=event_id))
        retry = post(body, signed_headers(body, event_id=event_id))
        other = post(body, signed_headers(body))  # same X-Webhook-ID, new event
        assert first.json() == {"received": True}
        assert retry.json() == {"received": True, "duplicate": True}
        assert other.json() == {"received": True}


class TestInvalidRequests:
    def test_missing_headers_400(self):
        body = json.dumps(message_delivered())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature_401(self):
        body = json.dumps(message_delivered())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 401

    def test_other_webhooks_secret_401(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-012345678").decode()
        body = json.dumps(message_delivered())
        assert post(body, signed_headers(body, secret=other)).status_code == 401

    def test_tampered_body_401(self):
        body = json.dumps(message_delivered())
        headers = signed_headers(body)
        assert post(body.replace("+1987654321", "+1000000000"), headers).status_code == 401

    def test_signature_must_cover_webhook_id(self):
        body = json.dumps(message_delivered())
        ts = str(now())
        headers = signed_headers(body, timestamp=ts, signature=sign(body, "some-other-id", ts))
        assert post(body, headers).status_code == 401

    def test_stale_timestamp_401(self):
        body = json.dumps(message_delivered())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 401

    def test_undecoded_secret_key_401(self):
        body = json.dumps(message_delivered())
        ts = str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{WEBHOOK_ID}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        assert post(body, signed_headers(body, timestamp=ts, signature=f"v1,{wrong}")).status_code == 401


class TestFailClosed:
    def test_503_without_secret(self, monkeypatch):
        monkeypatch.delenv("SENT_WEBHOOK_SECRET")
        body = json.dumps(message_delivered())
        assert post(body, signed_headers(body)).status_code == 503
