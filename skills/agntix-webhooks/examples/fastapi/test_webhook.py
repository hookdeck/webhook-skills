# Generated with: agntix-webhooks skill
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

# Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"agntix-test-signing-key-012345678").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-endpoint-signing-key01").decode()

os.environ["AGNTIX_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Agntix (Svix)."""
    key = base64.b64decode(secret[len("whsec_"):])
    signed = f"{msg_id}.{timestamp}.{raw_body}".encode()
    return "v1," + base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()


def signed_headers(raw_body, *, msg_id=None, timestamp=None, secret=SECRET, signature=None,
                   content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else int(time.time()))
    return {
        "Content-Type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/agntix", content=raw_body, headers=headers)


def session_created(**overrides):
    event = {
        "id": str(uuid.uuid4()),
        "eventType": "session.created",
        "type": "VOICE",
        "platform": "PHONE",
        "direction": "OUTBOUND",
        "state": "OPEN",
        "agentId": "40235145-aa3d-443e-9d0c-841dd0716a2f",
        "createdAt": "2026-04-08T05:00:01.130Z",
        "metadata": {
            "customerPhoneNumber": "+971501234567",
            "sessionVariables": {"crmContactId": "CRM-7728"},
        },
    }
    event.update(overrides)
    return event


def session_ended(**overrides):
    event = session_created()
    event.update({
        "eventType": "session.ended",
        "state": "CLOSED",
        "lastActivityAt": "2026-04-08T05:00:01.130Z",
        "endedAt": "2026-04-08T05:00:10.546Z",
        "analysis": {"summary": "Customer confirmed delivery slot for Wednesday afternoon."},
        "recordingUrl": "https://app.agntix.ai/en/logs-history?opened=4981804c",
    })
    event.update(overrides)
    return event


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["AGNTIX_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["AGNTIX_WEBHOOK_SECRET"] = SECRET


class TestValidSignatures:
    def test_accepts_session_created(self, caplog):
        body = json.dumps(session_created())
        with caplog.at_level(logging.INFO, logger="agntix-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Session created" in caplog.text

    def test_accepts_session_ended(self, caplog):
        body = json.dumps(session_ended())
        with caplog.at_level(logging.INFO, logger="agntix-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Customer confirmed delivery slot" in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        body = json.dumps(session_created(eventType="session.updated"))
        with caplog.at_level(logging.INFO, logger="agntix-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Agntix event type" in caplog.text

    def test_verifies_any_content_type(self):
        body = json.dumps(session_created())
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_accepts_when_any_signature_matches(self):
        body = json.dumps(session_created())
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= {headers['svix-signature']}"
        assert post(body, headers).status_code == 200


class TestDeduplication:
    def test_retried_event_is_acknowledged_as_duplicate(self):
        body = json.dumps(session_ended())
        first = post(body, signed_headers(body))
        retry = post(body, signed_headers(body))
        assert first.json() == {"received": True}
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}

    def test_session_ended_is_not_a_duplicate_of_session_created(self):
        created = session_created()
        created_body = json.dumps(created)
        ended_body = json.dumps(session_ended(id=created["id"]))
        post(created_body, signed_headers(created_body))
        res = post(ended_body, signed_headers(ended_body))
        assert res.status_code == 200
        assert res.json() == {"received": True}


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = json.dumps(session_created())
        headers = signed_headers(body)
        res = post(body.replace("VOICE", "CHAT"), headers)
        assert res.status_code == 400

    def test_rejects_other_endpoint_secret(self):
        body = json.dumps(session_created())
        assert post(body, signed_headers(body, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_old_timestamp(self):
        body = json.dumps(session_created())
        assert post(body, signed_headers(body, timestamp=int(time.time()) - 600)).status_code == 400

    def test_rejects_future_timestamp(self):
        body = json.dumps(session_created())
        assert post(body, signed_headers(body, timestamp=int(time.time()) + 600)).status_code == 400

    def test_rejects_malformed_signature(self):
        body = json.dumps(session_created())
        assert post(body, signed_headers(body, signature="garbage")).status_code == 400

    @pytest.mark.parametrize("name", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, name):
        body = json.dumps(session_created())
        headers = signed_headers(body)
        del headers[name]
        res = post(body, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing Svix signature headers"

    def test_fails_closed_without_secret(self):
        del os.environ["AGNTIX_WEBHOOK_SECRET"]
        body = json.dumps(session_created())
        assert post(body, signed_headers(body)).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
