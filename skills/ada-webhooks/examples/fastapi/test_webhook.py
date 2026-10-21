# Generated with: ada-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Ada (Svix) secrets look like "whsec_" + base64(key bytes), for example
# "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"ada-test-signing-key-0123456789ab").decode()

os.environ["ADA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Svix does for Ada deliveries."""
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
    return client.post("/webhooks/ada", content=raw_body, headers=headers)


def event(event_type: str, data: dict) -> dict:
    return {"type": event_type, "timestamp": "2026-10-21T09:30:00.123Z", "data": data}


def conversation_created() -> str:
    return json.dumps(
        event(
            "v1.conversation.created",
            {
                "conversation_id": "5f7e0e2c1a2b3c4d5e6f7a8b",
                "channel_id": "5df263b7db5a7e6ea03fae9b",
                "created_at": "2026-10-21T09:30:00Z",
                "end_user_id": "5f7e0e2c1a2b3c4d5e6f7a8c",
                "metadata": {"plan": "pro"},
                "ai_agent_domain": "example.ada.support",
            },
        )
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("ADA_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_conversation_created(self):
        body = conversation_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_conversation_message(self):
        body = json.dumps(
            event(
                "v1.conversation.message",
                {
                    "message_id": "msg-1",
                    "conversation_id": "5f7e0e2c1a2b3c4d5e6f7a8b",
                    "author": {"id": None, "role": "human_agent", "display_name": "Sam"},
                    "content": {"type": "text", "body": "Let me check that for you."},
                    "handoff_integration": "zendesk_chat",
                },
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_conversation_ended(self):
        body = json.dumps(
            event(
                "v1.conversation.ended",
                {"conversation_id": "5f7e0e2c1a2b3c4d5e6f7a8b", "ended_by": {"id": None, "role": "system"}},
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_end_user_updated_with_tags(self):
        payload = event(
            "v1.end_user.updated",
            {"end_user_id": "5f7e0e2c1a2b3c4d5e6f7a8c", "profile": {"first_name": "Ada"}},
        )
        payload["tags"] = ["5f7e0e2c1a2b3c4d5e6f7a8c"]
        body = json.dumps(payload)
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_proactive_call_answered(self):
        body = json.dumps(
            event(
                "v1.proactive_call.answered",
                {"proactive_attempt_id": "pa_1", "state": "answered", "conversation_id": "c_1"},
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_unknown_event_type_acknowledged(self):
        body = json.dumps(event("v1.something.new", {}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = conversation_created()
        headers = signed_headers(body)
        headers["svix-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["svix-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_retry_with_same_svix_id_is_duplicate(self):
        body = conversation_created()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = conversation_created()
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = conversation_created()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_endpoint_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = conversation_created()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = conversation_created()
        headers = signed_headers(body)
        res = post(body.replace("pro", "enterprise"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = conversation_created()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = conversation_created()
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(
                SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
            ).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("ADA_WEBHOOK_SECRET")
        body = conversation_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
