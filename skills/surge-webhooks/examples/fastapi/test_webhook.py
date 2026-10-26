# Generated with: surge-webhooks skill
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

# Surge secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
# the decoded part.
SECRET = "whsec_" + base64.b64encode(b"surge-test-signing-key-0123456789").decode()

os.environ["SURGE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Surge does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Surge) or 'svix' (fallback)."""
    msg_id = msg_id or uuid.uuid4().hex[:24]
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/surge", content=raw_body, headers=headers)


def hex24():
    return uuid.uuid4().hex[:24]


def envelope(event_type, data=None, event_id="auto"):
    """Surge envelope: {id, type, timestamp, account_id, data}."""
    event = {
        "type": event_type,
        "timestamp": "2024-10-21T23:29:43Z",
        "account_id": "acct_01jrz",
        "data": data if data is not None else {"id": "msg_01jav96823f9x9054d6gyzpp16"},
    }
    if event_id == "auto":
        event_id = "evt_" + hex24()
    if event_id:
        event["id"] = event_id
    return event


def received(event_id="auto"):
    return envelope(
        "message.received",
        {
            "id": "msg_01jav96823f9x9054d6gyzpp16",
            "body": "Is the 3pm slot still available?",
            "conversation": {"id": "cnv_01jav8xy7fe4nsay3c9deqxge9"},
        },
        event_id,
    )


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["SURGE_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["SURGE_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(received())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(received())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(received())
        headers = signed_headers(raw)
        headers.update({"svix-id": "other-id", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"id":"evt_1",  "type":"message.sent",\n"timestamp":"2024-10-21T23:29:43Z","data":{"id":"msg_1"}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(received())
        msg_id, ts = "multi-id", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(received())
        msg_id, ts = "v1a-id", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(received())
        headers = signed_headers(raw)
        res = post(raw.replace("3pm", "4pm"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(received())
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-0123456").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(received())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(received())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(received())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(received())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["SURGE_WEBHOOK_SECRET"]
        raw = json.dumps(received())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


EVENTS = [
    "message.sent",
    "message.delivered",
    "message.failed",
    "message.received",
    "contact.opted_in",
    "contact.opted_out",
    "conversation.created",
    "campaign.approved",
    "phone_number.imported",
    "phone_number.attached_to_campaign",
    "link.followed",
    "call.ended",
    "recording.completed",
    "voicemail.received",
]


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, caplog):
        raw = json.dumps(envelope(event_type))
        with caplog.at_level(logging.INFO, logger="surge-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_the_failure_reason(self, caplog):
        raw = json.dumps(envelope("message.failed", {"id": "msg_9", "failure_reason": "opted_out"}))
        with caplog.at_level(logging.INFO, logger="surge-webhooks"):
            post(raw, signed_headers(raw))
        assert "Message failed: msg_9 (opted_out)" in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(envelope("campaign.rejected"))
        with caplog.at_level(logging.INFO, logger="surge-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Surge event type: campaign.rejected" in caplog.text

    def test_acknowledges_retried_event_id_as_duplicate(self):
        raw = json.dumps(received("evt_dedupe_1"))
        first = post(raw, signed_headers(raw))
        assert first.json() == {"received": True}

        retry = post(raw, signed_headers(raw))  # new webhook-id, same envelope id
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}

    def test_dedupes_on_type_and_data_id_without_envelope_id(self):
        raw = json.dumps(envelope("message.delivered", {"id": "msg_nodup"}, event_id=None))
        assert post(raw, signed_headers(raw)).json() == {"received": True}
        assert post(raw, signed_headers(raw)).json() == {"received": True, "duplicate": True}


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
