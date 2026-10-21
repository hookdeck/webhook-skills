# Generated with: agentmail-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"agentmail-test-signing-key-01234").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-webhook-signing-key00").decode()

os.environ["AGENTMAIL_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like AgentMail (Svix)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/agentmail", content=raw_body, headers=headers)


def unique_id() -> str:
    return uuid.uuid4().hex


def message_received(**overrides) -> dict:
    event = {
        "type": "event",
        "event_type": "message.received",
        "event_id": unique_id(),
        "message": {
            "inbox_id": "inbox_456def",
            "thread_id": "thd_789ghi",
            "message_id": "<abc123@agentmail.to>",
            "labels": ["received"],
            "timestamp": "2023-10-27T10:00:00Z",
            "from": "Jane Doe <jane@example.com>",
            "to": ["Support Agent <support@agentmail.to>"],
            "subject": "Question about my account",
            "preview": "A short preview of the email text...",
            "text": "The full text body of the email.",
            "html": "<html>...</html>",
            "size": 2048,
            "updated_at": "2023-10-27T10:00:00Z",
            "created_at": "2023-10-27T10:00:00Z",
        },
        "thread": {
            "inbox_id": "inbox_456def",
            "thread_id": "thd_789ghi",
            "labels": ["received"],
            "subject": "Question about my account",
            "last_message_id": "<abc123@agentmail.to>",
            "message_count": 1,
        },
    }
    event.update(overrides)
    return event


PAYLOADS = {
    "message.sent": {
        "send": {"message_id": "<abc123@agentmail.to>", "timestamp": "2023-10-27T10:05:00Z", "recipients": ["recipient@example.com"]},
    },
    "message.delivered": {
        "delivery": {"message_id": "<abc123@agentmail.to>", "timestamp": "2023-10-27T10:06:00Z", "recipients": ["recipient@example.com"]},
    },
    "message.bounced": {
        "bounce": {
            "message_id": "<abc123@agentmail.to>",
            "timestamp": "2023-10-27T10:07:00Z",
            "type": "Permanent",
            "sub_type": "General",
            "recipients": [{"address": "invalid@example.com", "status": "bounced"}],
        },
    },
    "message.complained": {
        "complaint": {
            "message_id": "<abc123@agentmail.to>",
            "timestamp": "2023-10-27T10:08:00Z",
            "type": "abuse",
            "sub_type": "spam",
            "recipients": ["complainer@example.com"],
        },
    },
    "message.rejected": {
        "reject": {"message_id": "<abc123@agentmail.to>", "timestamp": "2023-10-27T10:09:00Z", "reason": "Invalid recipient address"},
    },
    "message.opened": {"open": {"message_id": "<abc123@agentmail.to>", "timestamp": "2023-10-27T10:15:00Z"}},
    "message.security.review": {
        "message": {
            "organization_id": "7f0c2a52-6a8e-4d0e-9a5e-2f3b1c4d5e6f",
            "message_id": "<abc123@agentmail.to>",
            "agent_armor": {"status": "complete", "verdict": "review", "reason": "Suspicious", "model": "armor-2026-10-07"},
        },
    },
    "domain.verified": {
        "domain": {"domain_id": "dom_123abc", "status": "verified", "feedback_enabled": True, "records": []},
    },
    "calendar.event.starting": {
        "calendar_event": {"event_id": "3f8a2c1e", "kind": "single", "title": "Intro call with Acme"},
        "scheduled_at": "2026-10-15T18:00:00Z",
    },
}


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("AGENTMAIL_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_accepts_message_received(self, caplog):
        caplog.set_level("INFO", logger="agentmail-webhooks")
        body = json.dumps(message_received())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Question about my account" in caplog.text

    @pytest.mark.parametrize("event_type", list(PAYLOADS))
    def test_accepts_event_types(self, event_type):
        body = json.dumps({"type": "event", "event_type": event_type, "event_id": unique_id(), **PAYLOADS[event_type]})
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_message_received_spam(self):
        body = json.dumps(message_received(event_type="message.received.spam"))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps({"type": "event", "event_type": "something.new", "event_id": unique_id()})
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_accepts_any_matching_signature_in_list(self):
        body = json.dumps(message_received())
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= {headers['svix-signature']}"
        res = post(body, headers)
        assert res.status_code == 200


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = json.dumps(message_received())
        headers = signed_headers(body)
        res = post(body.replace("Question", "Urgent"), headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Invalid signature"}

    def test_rejects_other_webhook_secret(self):
        body = json.dumps(message_received())
        res = post(body, signed_headers(body, secret=OTHER_SECRET))
        assert res.status_code == 400

    def test_rejects_stale_timestamp(self):
        body = json.dumps(message_received())
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_rejects_future_timestamp(self):
        body = json.dumps(message_received())
        res = post(body, signed_headers(body, timestamp=now() + 600))
        assert res.status_code == 400

    def test_rejects_malformed_signature_header(self):
        body = json.dumps(message_received())
        res = post(body, signed_headers(body, signature="garbage"))
        assert res.status_code == 400

    @pytest.mark.parametrize("header", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, header):
        body = json.dumps(message_received())
        headers = signed_headers(body)
        del headers[header]
        res = post(body, headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Missing Svix signature headers"}

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("AGENTMAIL_WEBHOOK_SECRET")
        body = json.dumps(message_received())
        res = post(body, signed_headers(body))
        assert res.status_code == 500


class TestDeduplication:
    def test_dedupes_on_event_id_even_when_svix_id_differs(self):
        body = json.dumps(message_received())

        first = post(body, signed_headers(body, msg_id="msg_org_level"))
        assert first.status_code == 200
        assert first.json() == {"received": True}

        second = post(body, signed_headers(body, msg_id="msg_inbox_level"))
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").status_code == 200
