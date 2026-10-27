# Generated with: relay-messenger-webhooks skill
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

# Relay secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_cmVsYXktdGVzdC1zaWduaW5nLWtleS0wMTIzNDU2Nzg5YQ==". The HMAC key is
# the decoded part.
SECRET = "whsec_" + base64.b64encode(b"relay-test-signing-key-0123456789a").decode()

os.environ["RELAY_MESSENGER_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Relay does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Relay) or 'svix' (fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/relay-messenger", content=raw_body, headers=headers)


def envelope(event_type, data, event_id=None):
    return {
        "api_version": "v1",
        "webhook_version": "2026-08-30",
        "event_type": event_type,
        "event_id": event_id or str(uuid.uuid4()),
        "created_at": "2026-02-05T19:31:13.736Z",
        "trace_id": "8af9171a45022df2eb74ba4e4c83be0f",
        "agent_id": "01a05223-bd8e-7619-8a44-b7e2069a226f",
        "data": data,
    }


HANDLE = {
    "id": "01a082e5-e880-73f9-9333-8e650dee9cac",
    "handle": "alex",
    "kind": "user",
    "display_name": "Alex",
    "is_me": False,
    "status": "active",
}


def message_received(event_id=None):
    return envelope(
        "message.received",
        {
            "chat_id": "8f392755-6865-4b18-880a-227f9d8b458f",
            "id": "89e3566e-1d13-49e5-a8ee-48490d5bfeb7",
            "direction": "inbound",
            "from": "alex",
            "from_handle": HANDLE,
            "is_from_me": False,
            "parts": [{"type": "text", "value": "Hello!"}],
            "sent_at": "2026-10-04T20:37:57.254Z",
        },
        event_id,
    )


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["RELAY_MESSENGER_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["RELAY_MESSENGER_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(message_received())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(message_received())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(message_received())
        headers = signed_headers(raw)
        headers.update({"svix-id": "msg_other", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"api_version":"v1",  "event_type":"message.sent","event_id":"e-1",\n"data":{"id":"m1","chat_id":"c1"}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(message_received())
        msg_id, ts = "msg_multi", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(message_received())
        msg_id, ts = "msg_v1a", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(message_received())
        headers = signed_headers(raw)
        res = post(raw.replace("Hello!", "Hacked"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(message_received())
        other = "whsec_" + base64.b64encode(b"another-subscription-secret-01").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(message_received())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(message_received())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(message_received())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(message_received())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["RELAY_MESSENGER_WEBHOOK_SECRET"]
        raw = json.dumps(message_received())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


EVENTS = [
    ("message.received", {"id": "m1", "chat_id": "c1", "from_handle": HANDLE}),
    ("message.sent", {"id": "m2", "chat_id": "c1"}),
    ("message.delivered", {"id": "m2", "chat_id": "c1"}),
    ("message.read", {"id": "m2", "chat_id": "c1"}),
    ("message.failed", {"chat_id": "c1", "message_id": "m3", "code": 3006, "detail_code": 401, "reason": "HTTP 401"}),
    ("reaction.added", {"chat_id": "c1", "message_id": "m2", "part_index": 0, "reaction_type": "love", "from_handle": HANDLE}),
    ("reaction.removed", {"chat_id": "c1", "message_id": "m2", "part_index": 0, "reaction_type": "love", "from_handle": HANDLE}),
    ("chat.created", {"id": "c1", "is_group": False}),
    ("participant.added", {"chat_id": "c1", "participant": HANDLE}),
    ("participant.removed", {"chat_id": "c1", "participant": HANDLE}),
]


class TestEventHandling:
    @pytest.mark.parametrize("event_type,data", EVENTS, ids=[e[0] for e in EVENTS])
    def test_handles_event(self, event_type, data, caplog):
        raw = json.dumps(envelope(event_type, data))
        with caplog.at_level(logging.INFO, logger="relay-messenger-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(envelope("call.created", {"call": {"id": "call1", "status": "ringing"}}))
        with caplog.at_level(logging.INFO, logger="relay-messenger-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Relay event type: call.created" in caplog.text

    def test_acknowledges_retried_event_id_as_duplicate(self):
        raw = json.dumps(message_received("evt-dedupe-1"))
        first = post(raw, signed_headers(raw))
        assert first.json() == {"received": True}

        retry = post(raw, signed_headers(raw))  # new webhook-id, same event_id
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}


class TestResolveSignatureHeaders:
    def test_maps_svix_headers_when_webhook_id_absent(self):
        h = {"svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x"}
        assert resolve_signature_headers(h) == {
            "webhook-id": "a",
            "webhook-timestamp": "1",
            "webhook-signature": "v1,x",
        }

    def test_returns_none_when_a_header_is_missing(self):
        assert resolve_signature_headers({"webhook-id": "a", "webhook-timestamp": "1"}) is None


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
