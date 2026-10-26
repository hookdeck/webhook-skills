# Generated with: notifuse-webhooks skill
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

# Notifuse secrets look like "whsec_" + base64(32 random bytes). The HMAC key
# is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"notifuse-test-signing-key-0123456").decode()


def other_secret(label: str) -> str:
    return "whsec_" + base64.b64encode(label.ljust(32, "0").encode()).decode()


os.environ["NOTIFUSE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Notifuse does (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None,
                   content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature if signature is not None else sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/notifuse", content=raw_body.encode(), headers=headers)


def envelope(event_type: str, data: dict) -> str:
    return json.dumps({
        "id": f"delivery_{uuid.uuid4().hex}",
        "type": event_type,
        "timestamp": "2026-10-26T10:30:00Z",
        "workspace_id": "ws_1234567890",
        "data": data,
    })


CONTACT = {"id": "contact_12345", "email": "user@example.com", "first_name": "John"}
EMAIL = {"message_id": "msg_xyz789", "email": "user@example.com", "subject": "Welcome"}
SEGMENT = {"email": "user@example.com", "contact_id": "contact_12345", "segment_id": "seg_vip", "segment_name": "VIP"}
LIST = {"email": "user@example.com"}
CUSTOM = {"event_name": "orders/fulfilled"}

EVENTS = {
    "contact.created": CONTACT,
    "contact.updated": CONTACT,
    "contact.deleted": CONTACT,
    "list.subscribed": LIST,
    "list.unsubscribed": LIST,
    "list.confirmed": LIST,
    "list.resubscribed": LIST,
    "list.bounced": LIST,
    "list.complained": LIST,
    "list.pending": LIST,
    "list.removed": LIST,
    "segment.joined": SEGMENT,
    "segment.left": SEGMENT,
    "email.sent": EMAIL,
    "email.delivered": EMAIL,
    "email.opened": EMAIL,
    "email.clicked": EMAIL,
    "email.bounced": EMAIL,
    "email.complained": EMAIL,
    "email.unsubscribed": EMAIL,
    "custom_event.created": CUSTOM,
    "custom_event.updated": CUSTOM,
    "custom_event.deleted": CUSTOM,
}


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("NOTIFUSE_WEBHOOK_SECRET", SECRET)


class TestValidDeliveries:
    @pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
    def test_accepts_event(self, event_type, data, caplog):
        body = envelope(event_type, data)
        with caplog.at_level(logging.INFO, logger="notifuse-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert event_type in caplog.text
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        body = envelope("contact.merged", {})
        with caplog.at_level(logging.INFO, logger="notifuse-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Notifuse event type" in caplog.text

    def test_verifies_any_content_type_against_raw_bytes(self):
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body, content_type="text/plain")).status_code == 200

    def test_verifies_unusual_whitespace_byte_for_byte(self):
        body = ('{ "id" : "delivery_1",\n  "type":"contact.created", "timestamp":"2026-10-26T10:30:00Z", '
                '"workspace_id":"ws_1", "data": {"email":"a@example.com","id":"c1"} }')
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_list_where_one_v1_entry_matches(self):
        body = envelope("contact.created", CONTACT)
        msg_id, ts = "msg_multi", str(now())
        old = sign(body, msg_id, ts, other_secret("previous-key"))
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"{old} {sign(body, msg_id, ts)}")
        assert post(body, headers).status_code == 200


class TestSvixHeaderFallback:
    def test_accepts_svix_prefixed_headers(self):
        body = envelope("email.sent", EMAIL)
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_present(self):
        body = envelope("email.sent", EMAIL)
        headers = signed_headers(body)
        headers.update({"svix-id": "x", "svix-timestamp": "1", "svix-signature": "v1,AAAA"})
        assert post(body, headers).status_code == 200

    def test_rejects_bad_signature_with_svix_headers(self):
        body = envelope("email.sent", EMAIL)
        res = post(body, signed_headers(body, prefix="svix", secret=other_secret("another-key")))
        assert res.status_code == 400


class TestRejections:
    def test_missing_signature_header(self):
        body = envelope("contact.created", CONTACT)
        headers = signed_headers(body)
        del headers["webhook-signature"]
        assert post(body, headers).status_code == 400

    def test_all_headers_missing(self):
        assert post("{}", {"content-type": "application/json"}).status_code == 400

    def test_wrong_signature(self):
        body = envelope("contact.created", CONTACT)
        sig = "v1," + base64.b64encode(b"\x01" * 32).decode()
        assert post(body, signed_headers(body, signature=sig)).status_code == 400

    def test_signature_from_other_secret(self):
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body, secret=other_secret("a-different-key"))).status_code == 400

    def test_tampered_body(self):
        body = envelope("contact.created", CONTACT)
        headers = signed_headers(body)
        assert post(body.replace("user@example.com", "evil@example.com"), headers).status_code == 400

    def test_timestamp_older_than_five_minutes(self):
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_timestamp_too_far_in_future(self):
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body, timestamp=now() + 600)).status_code == 400

    def test_non_numeric_timestamp(self):
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body, timestamp="yesterday")).status_code == 400

    def test_v1a_only_signature(self):
        body = envelope("contact.created", CONTACT)
        msg_id, ts = "msg_v1a", str(now())
        sig = sign(body, msg_id, ts).replace("v1,", "v1a,")
        assert post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=sig)).status_code == 400


class TestFailClosed:
    def test_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("NOTIFUSE_WEBHOOK_SECRET")
        body = envelope("contact.created", CONTACT)
        assert post(body, signed_headers(body)).status_code == 500


class TestIdempotency:
    def test_repeated_webhook_id_is_duplicate(self):
        body = envelope("email.opened", EMAIL)
        headers = signed_headers(body, msg_id="msg_dupe_1")
        assert post(body, headers).json() == {"received": True}
        second = post(body, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").status_code == 200
