# Generated with: cloudtalk-webhooks skill
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
SECRET = "whsec_" + base64.b64encode(b"cloudtalk-test-signing-key-0123").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-endpoint-signing-key").decode()

os.environ["CLOUDTALK_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like CloudTalk (Svix)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/cloudtalk", content=raw_body, headers=headers)


def envelope(event_type: str, data: dict, **overrides) -> dict:
    event = {
        "event_id": str(uuid.uuid4()),
        "type": event_type,
        "version": "v1",
        "occurred_at": "2026-08-17T09:34:21.512Z",
        "company_id": "123456",
        "data": data,
    }
    event.update(overrides)
    return event


NUMBER = {"number_e164": "+12025550178", "id": "9911", "internal_name": "Sales line", "number_type": "fixed", "country": "US"}
USER = {"id": "987654", "name": "John Smith", "email": "john.smith@example.com", "role": "agent", "extension": "1001"}
CONTACT = {"id": "44210", "name": "Jane Doe", "company": "Acme Inc.", "phones": ["+12025550143"], "emails": ["jane.doe@example.com"]}
CALL = {"call_uuid": "018f7d3a-2b4c-7e5f-9a6b-1c2d3e4f5a6b"}
MESSAGE = {
    "id": "987654",
    "conversation_id": "55321",
    "channel": "mms",
    "external_number": "+12025550143",
    "internal_number": NUMBER,
    "body": "Hi Jane, your appointment is confirmed.",
    "contact": CONTACT,
    "user": USER,
}
CALL_ENDED = {
    "call_id": "143223459",
    "call_uuid": CALL["call_uuid"],
    "direction": "incoming",
    "external_number": "+12025550143",
    "internal_number": NUMBER,
    "started_at": "2026-08-17T09:38:05Z",
    "ended_at": "2026-08-17T09:41:23Z",
    "talking_time": 154,
    "waiting_time": 44,
    "duration": 198,
    "recorded": True,
    "is_voicemail": False,
    "contacts": [CONTACT],
    "contacts_total": 1,
    "user": USER,
}
CALL_LIVE = {**CALL, "direction": "inbound", "external_number": "+12025550143", "internal_number": NUMBER}

PAYLOADS = {
    "call.started": CALL_LIVE,
    "call.ringing": CALL_LIVE,
    "call.answered": CALL_LIVE,
    "call.held": {**CALL, "user": USER},
    "call.resumed": {**CALL, "user": USER},
    "call.ended": CALL_ENDED,
    "call.recording_ready": {"call_id": "143223459", "call_uuid": CALL["call_uuid"], "contacts": [CONTACT], "contacts_total": 1},
    "call.tags_modified": dict(CALL),
    "contact.created": {**CONTACT, "tags": ["vip"], "created_at": "2026-08-17T09:34:21Z"},
    "contact.updated": dict(CONTACT),
    "contact.deleted": {"id": "44210"},
    "user.created": dict(USER),
    "user.updated": dict(USER),
    "user.deleted": {"id": "987654"},
    "user.status_changed": {"user_id": "4207", "status": "idle", "sub_status": "Lunch", "sub_status_id": "19"},
    "message.sent": {**MESSAGE, "direction": "outbound"},
    "message.received": {**MESSAGE, "direction": "inbound"},
    "transcript.ready": dict(CALL),
    "cidata.ready": dict(CALL),
    "voice_agent.extracted_data_ready": {},
    "dialer.disposition_created": {},
    "dialer.survey_filled": {},
}


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("CLOUDTALK_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", list(PAYLOADS))
    def test_accepts_event_types(self, event_type):
        body = json.dumps(envelope(event_type, PAYLOADS[event_type]))
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dispatches_on_envelope_type(self, caplog):
        caplog.set_level("INFO", logger="cloudtalk-webhooks")
        body = json.dumps(envelope("call.ended", CALL_ENDED))
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "198s total" in caplog.text

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(envelope("contact.created", PAYLOADS["contact.created"]))
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps(envelope("something.new", {}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_accepts_any_matching_signature_in_list(self):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= {headers['svix-signature']}"
        res = post(body, headers)
        assert res.status_code == 200


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = json.dumps(envelope("contact.created", PAYLOADS["contact.created"]))
        headers = signed_headers(body)
        res = post(body.replace("Jane", "Mallory"), headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Invalid signature"}

    def test_rejects_other_endpoint_secret(self):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        res = post(body, signed_headers(body, secret=OTHER_SECRET))
        assert res.status_code == 400

    def test_rejects_stale_timestamp(self):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_rejects_future_timestamp(self):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        res = post(body, signed_headers(body, timestamp=now() + 600))
        assert res.status_code == 400

    def test_rejects_malformed_signature_header(self):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        res = post(body, signed_headers(body, signature="garbage"))
        assert res.status_code == 400

    @pytest.mark.parametrize("header", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, header):
        body = json.dumps(envelope("call.started", CALL_LIVE))
        headers = signed_headers(body)
        del headers[header]
        res = post(body, headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Missing Svix signature headers"}

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("CLOUDTALK_WEBHOOK_SECRET")
        body = json.dumps(envelope("call.started", CALL_LIVE))
        res = post(body, signed_headers(body))
        assert res.status_code == 500


class TestDeduplication:
    def test_retry_with_same_event_id_is_acknowledged_once(self):
        body = json.dumps(envelope("call.ended", CALL_ENDED))
        msg_id = "msg_retry_test"

        first = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert first.json() == {"received": True}

        # A retry is re-signed with a fresh timestamp but keeps svix-id and event_id.
        second = post(body, signed_headers(body, msg_id=msg_id, timestamp=now() + 1))
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
