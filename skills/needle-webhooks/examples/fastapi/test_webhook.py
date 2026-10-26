# Generated with: needle-webhooks skill
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

# Needle secrets look like "whsec_" + base64. The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"needle-test-signing-key-0123456789").decode()

os.environ["NEEDLE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Standard Webhooks (the scheme Needle uses)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or str(uuid.uuid4())
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/needle", content=raw_body, headers=headers)


# Payloads match the body shape in Needle's webhook docs.
def event(event_type: str, inner: dict = None) -> dict:
    event_id = str(uuid.uuid4())
    return {
        "version": "v1",
        "id": event_id,
        "type": event_type,
        "timestamp": "2026-01-01T12:00:00.000Z",
        "data": {
            "id": event_id,
            "type": event_type,
            "label": "Example",
            "occurredAt": "2026-01-01T12:00:00.000Z",
            "channel": "linkedin",
            "nodeId": None,
            "leadId": "00000000-0000-0000-0000-000000000002",
            "leadName": "Jane Doe",
            "leadEmail": "jane@example.com",
            "campaignId": "00000000-0000-0000-0000-000000000003",
            "enrollmentId": "00000000-0000-0000-0000-000000000004",
            "connectedAccountId": "00000000-0000-0000-0000-000000000005",
            "data": inner or {},
        },
    }


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("NEEDLE_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_accepts_lead_created(self, caplog):
        body = json.dumps(event("lead_created"))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Lead created: Jane Doe" in caplog.text

    def test_accepts_linkedin_message_received(self, caplog):
        body = json.dumps(event("linkedin_message_received", {"text": "Hello!"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Hello!" in caplog.text

    def test_accepts_enrollment_completed(self, caplog):
        body = json.dumps(event("enrollment_completed"))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "completed in campaign" in caplog.text

    @pytest.mark.parametrize("event_type", ["campaign_status_changed", "account_disconnected"])
    def test_accepts_other_handled_events(self, event_type):
        body = json.dumps(event(event_type))
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_a_non_json_content_type(self):
        body = json.dumps(event("lead_updated"))
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_acknowledges_unknown_event_types(self, caplog):
        body = json.dumps(event("something_new_from_needle"))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Needle event type" in caplog.text

    def test_accepts_when_any_of_several_signatures_matches(self):
        body = json.dumps(event("lead_created"))
        headers = signed_headers(body)
        bogus = "v1," + base64.b64encode(b"bogus").decode()
        headers["webhook-signature"] = f"{bogus} {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_resend_with_same_webhook_id_is_acknowledged(self):
        body = json.dumps(event("lead_created"))
        headers = signed_headers(body, webhook_id="evt-resend-1")
        assert post(body, headers).status_code == 200
        again = post(body, headers)
        assert again.status_code == 200
        assert again.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_rejects_missing_headers(self):
        body = json.dumps(event("lead_created"))
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_rejects_bad_signature(self):
        body = json.dumps(event("lead_created"))
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_rejects_different_secret(self):
        body = json.dumps(event("lead_created"))
        other = "whsec_" + base64.b64encode(b"some-other-signing-key-000000000").decode()
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_rejects_tampered_body(self):
        body = json.dumps(event("lead_created"))
        headers = signed_headers(body)
        assert post(body.replace("Jane Doe", "Mallory"), headers).status_code == 400

    def test_rejects_stale_timestamp(self):
        body = json.dumps(event("lead_created"))
        assert post(body, signed_headers(body, timestamp=now() - 10 * 60)).status_code == 400

    def test_rejects_signature_keyed_with_undecoded_secret(self):
        body = json.dumps(event("lead_created"))
        msg_id, ts = str(uuid.uuid4()), str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET.encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, webhook_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("NEEDLE_WEBHOOK_SECRET", raising=False)
        body = json.dumps(event("lead_created"))
        assert post(body, signed_headers(body)).status_code == 500
