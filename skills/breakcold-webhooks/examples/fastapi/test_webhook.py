# Generated with: breakcold-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Breakcold webhook receiver."""

import hashlib
import hmac
import itertools
import json
import os
import time

import pytest

TEST_SECRET = "breakcold_test_signing_secret"
os.environ["BREAKCOLD_WEBHOOK_SECRET"] = TEST_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, is_timestamp_fresh, verify_breakcold_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm as Breakcold: hex HMAC-SHA256 over `{timestamp}.{raw body}`."""
    signed = timestamp.encode("latin-1") + b"." + body
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def envelope(event, data):
    return {
        "eventId": "evt_abc123",
        "timestamp": "2026-03-19T12:00:00.000Z",
        "workspaceId": "workspace_id",
        "event": event,
        "data": data,
    }


# Payloads as shown in https://docs.breakcold.com/api/webhooks
RECORD = {"id": "record_id", "objectType": "person", "objectTypeName": "Person", "name": "Ada Lovelace",
          "fields": {"name": "Ada Lovelace", "email": "ada@example.com"}}
NOTE = {"recordId": "record_id", "noteId": "note_id", "title": "Follow up"}
TASK = {"recordId": "record_id", "taskId": "task_id", "title": "Send proposal", "status": "todo",
        "dueAt": "2026-03-20T09:00:00.000Z"}
RELATION = {"sourceRecordId": "record_id", "targetRecordId": "related_record_id",
            "fieldDefinitionId": "field_definition_id", "fieldSlug": "company"}
CALL = {"recordId": "record_id", "callId": "call_recording_id", "recordName": "Ada Lovelace",
        "meetingTitle": "Discovery call"}
FILE = {"recordId": "record_id", "fileName": "contract.pdf"}

EVENTS = {
    "record.created": RECORD,
    "record.updated": RECORD,
    "record.deleted": {"id": "record_id", "deleted": True},
    "note.created": NOTE,
    "note.updated": NOTE,
    "note.deleted": NOTE,
    "task.created": TASK,
    "task.completed": {**TASK, "status": "done"},
    "relation.added": RELATION,
    "relation.removed": RELATION,
    "call.linked": CALL,
    "call.unlinked": CALL,
    "file.uploaded": FILE,
    "file.deleted": FILE,
    "webhook.test": {"message": "This is a test webhook delivery from Breakcold."},
}

_counter = itertools.count(1)


def post(event="record.created", body=None, ts=None, sig=None, content_type="application/json",
         headers=None, omit_sig=False, omit_ts=False):
    raw = body if body is not None else json.dumps(envelope(event, EVENTS[event])).encode()
    ts = ts if ts is not None else str(int(time.time()))
    h = {
        "Content-Type": content_type,
        "X-Webhook-Event": event,
        "X-Webhook-Delivery-Id": f"delivery_{next(_counter)}",
    }
    if not omit_sig:
        h["X-Webhook-Signature"] = sig if sig is not None else f"sha256={sign(raw, ts)}"
    if not omit_ts:
        h["X-Webhook-Timestamp"] = ts
    h.update(headers or {})
    return client.post("/webhooks/breakcold", content=raw, headers=h)


class TestVerifyFunction:
    body = b'{"event":"webhook.test"}'
    ts = "1773921600"

    def test_accepts_prefixed_bare_and_uppercase(self):
        digest = sign(self.body, self.ts)
        assert verify_breakcold_signature(self.body, f"sha256={digest}", self.ts, TEST_SECRET)
        assert verify_breakcold_signature(self.body, digest, self.ts, TEST_SECRET)
        assert verify_breakcold_signature(self.body, f"sha256={digest.upper()}", self.ts, TEST_SECRET)

    def test_signs_bytes_not_decoded_text(self):
        binary = b"{\xff\xfe}"
        assert verify_breakcold_signature(binary, sign(binary, self.ts), self.ts, TEST_SECRET)

    def test_rejects_wrong_secret_tampering_and_changed_timestamp(self):
        digest = sign(self.body, self.ts)
        assert not verify_breakcold_signature(self.body, digest, self.ts, "other_secret")
        assert not verify_breakcold_signature(b'{"event":"record.deleted"}', digest, self.ts, TEST_SECRET)
        assert not verify_breakcold_signature(self.body, digest, "1773921601", TEST_SECRET)

    def test_rejects_body_only_mac(self):
        body_only = hmac.new(TEST_SECRET.encode(), self.body, hashlib.sha256).hexdigest()
        assert not verify_breakcold_signature(self.body, body_only, self.ts, TEST_SECRET)

    @pytest.mark.parametrize("value", ["", "sha256=", "sha256=abcd", "sha256=" + "z" * 64, "sha1=" + "a" * 64])
    def test_rejects_malformed_signature(self, value):
        assert not verify_breakcold_signature(self.body, value, self.ts, TEST_SECRET)

    def test_rejects_missing_inputs(self):
        digest = sign(self.body, self.ts)
        assert not verify_breakcold_signature(self.body, digest, None, TEST_SECRET)
        assert not verify_breakcold_signature(self.body, None, self.ts, TEST_SECRET)
        assert not verify_breakcold_signature(self.body, digest, self.ts, "")


class TestTimestampFresh:
    def test_off_by_default_and_enforced_when_enabled(self):
        assert is_timestamp_fresh("1", 0, now=1e9)
        assert is_timestamp_fresh("1000", 300, now=1100)
        assert not is_timestamp_fresh("1000", 300, now=1400)
        assert not is_timestamp_fresh("abc", 300, now=1000)


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event", list(EVENTS))
    def test_accepts_signed_events(self, event):
        res = post(event=event)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_content_type(self):
        assert post(content_type="text/plain").status_code == 200

    def test_accepts_bare_digest(self):
        raw = json.dumps(envelope("record.created", RECORD)).encode()
        ts = "1773921600"
        assert post(body=raw, ts=ts, sig=sign(raw, ts)).status_code == 200

    def test_old_timestamps_accepted_by_default(self):
        assert post(ts="1000000000").status_code == 200

    def test_old_timestamp_rejected_when_tolerance_enabled(self, monkeypatch):
        monkeypatch.setenv("BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(ts="1000000000").status_code == 401
        assert post().status_code == 200

    def test_missing_signature_or_timestamp(self):
        assert post(omit_sig=True).status_code == 401
        assert post(omit_ts=True, sig="sha256=" + "a" * 64).status_code == 401

    def test_invalid_signature(self):
        assert post(sig="sha256=" + "0" * 64).status_code == 401
        assert post(sig="garbage").status_code == 401

    def test_body_altered_after_signing(self):
        ts = "1773921600"
        signed = json.dumps(envelope("record.created", RECORD)).encode()
        res = post(body=signed.replace(b"Ada", b"Eve"), ts=ts, sig=f"sha256={sign(signed, ts)}")
        assert res.status_code == 401

    def test_signed_non_json_body_is_400(self):
        assert post(body=b"not json").status_code == 400

    def test_duplicate_delivery_ignored(self):
        raw = json.dumps(envelope("note.created", NOTE)).encode()
        first = post(body=raw, headers={"X-Webhook-Delivery-Id": "dup_1"})
        second = post(body=raw, headers={"X-Webhook-Delivery-Id": "dup_1"})
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}

    def test_missing_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("BREAKCOLD_WEBHOOK_SECRET")
        assert post().status_code == 500
