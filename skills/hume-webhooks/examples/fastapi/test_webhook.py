import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["HUME_WEBHOOK_SECRET"] = "test_hume_webhook_signing_key"
os.environ.pop("HUME_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, handle_hume_event, verify_hume_signature  # noqa: E402

client = TestClient(app)

SECRET = os.environ["HUME_WEBHOOK_SECRET"]


def digest(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Hume's digest: HMAC-SHA256(signing key, "<raw body>.<timestamp>"), hex.

    Built from bytes, like the verifier, so non-UTF-8 bodies sign correctly.
    """
    signed_content = b"".join([body, b".", timestamp.encode("latin-1")])
    return hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()


def now_seconds() -> str:
    return str(int(time.time()))


def sign(body: bytes, timestamp: str | None = None, secret: str = SECRET) -> dict:
    timestamp = timestamp or now_seconds()
    return {
        "x-hume-ai-webhook-signature": digest(body, timestamp, secret),
        "x-hume-ai-webhook-timestamp": timestamp,
    }


# Documented sample payloads (Hume docs, "Webhooks")
CHAT_STARTED = {
    "event_name": "chat_started",
    "chat_group_id": "9fc18597-3567-42d5-94d6-935bde84bf2f",
    "chat_id": "470a49f6-1dec-4afe-8b61-035d3b2d63b0",
    "config_id": "1b60e1a0-cc59-424a-8d2c-189d354db3f3",
    "caller_number": None,
    "custom_session_id": None,
    "start_time": 1716244940648,
    "chat_start_type": "new_chat_group",
}
CHAT_ENDED = {
    "event_name": "chat_ended",
    "chat_group_id": "9fc18597-3567-42d5-94d6-935bde84bf2f",
    "chat_id": "470a49f6-1dec-4afe-8b61-035d3b2d63b0",
    "config_id": "1b60e1a0-cc59-424a-8d2c-189d354db3f3",
    "caller_number": None,
    "custom_session_id": None,
    "end_time": 1716244958546,
    "duration_seconds": 180,
    "end_reason": "USER_ENDED",
}
TOOL_CALL = {
    "event_name": "tool_call",
    "chat_group_id": "9fc18597-3567-42d5-94d6-935bde84bf2f",
    "chat_id": "470a49f6-1dec-4afe-8b61-035d3b2d63b0",
    "config_id": "1b60e1a0-cc59-424a-8d2c-189d354db3f3",
    "caller_number": None,
    "custom_session_id": "string",
    "timestamp": 1716244958546,
    "tool_call_message": {
        "name": "get_current_weather",
        "parameters": '{"format": "fahrenheit", "location": "San Francisco, CA"}',
        "response_required": True,
        "tool_call_id": "d20827af-5d8d-4f66-b6b9-ce2e3e1ea2b2",
        "tool_type": "function",
    },
}


def post(body: bytes, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/hume",
        content=body,
        headers={"content-type": content_type, **headers},
    )


class TestVerifyHumeSignature:
    body = json.dumps(CHAT_STARTED).encode()
    ts = "1716244940"
    good = digest(body, ts)

    def verify(self, sig, ts=None, body=None, secret=SECRET, tolerance=0):
        return verify_hume_signature(
            self.body if body is None else body,
            sig,
            self.ts if ts is None else ts,
            secret,
            tolerance,
        )

    def test_accepts_bare_lowercase_digest(self):
        assert self.verify(self.good)

    def test_accepts_uppercase_hex(self):
        assert self.verify(self.good.upper())

    def test_signs_body_then_period_then_timestamp(self):
        reversed_order = hmac.new(
            SECRET.encode(), self.ts.encode() + b"." + self.body, hashlib.sha256
        ).hexdigest()
        assert not self.verify(reversed_order)

    def test_rejects_missing_or_empty_inputs(self):
        assert not self.verify(None)
        assert not self.verify("")
        assert not verify_hume_signature(self.body, self.good, None, SECRET, 0)
        assert not verify_hume_signature(self.body, self.good, "", SECRET, 0)
        assert not verify_hume_signature(self.body, self.good, self.ts, None, 0)

    def test_rejects_wrong_secret_tampered_body_or_timestamp(self):
        assert not self.verify(self.good, secret="other_secret")
        assert not self.verify(self.good, body=b"{}")
        assert not self.verify(self.good, ts="1716244941")

    def test_does_not_trim_timestamp(self):
        assert not self.verify(self.good, ts=f"{self.ts} ")

    @pytest.mark.parametrize(
        "sig",
        [
            good[:62],
            good + "00",
            "zz" + good[2:],  # 64 characters, but not all hex
            "sha256=" + good,  # a prefix is not part of Hume's format
            good + "\n",  # trailing newline must not slip past the format check
        ],
    )
    def test_rejects_malformed_digest(self, sig):
        assert not self.verify(sig)

    def test_verifies_exact_bytes_including_non_utf8(self):
        raw = b'{"a":"\xff\xfe"}'
        assert verify_hume_signature(raw, digest(raw, self.ts), self.ts, SECRET, 0)

    def test_old_timestamps_accepted_by_default(self):
        assert verify_hume_signature(self.body, self.good, self.ts, SECRET)

    def test_tolerance_rejects_stale_timestamp(self):
        old = str(int(time.time()) - 3600)
        sig = digest(self.body, old)
        assert not self.verify(sig, ts=old, tolerance=180)
        assert self.verify(sig, ts=old, tolerance=7200)

    def test_tolerance_accepts_fresh_and_rejects_non_numeric(self):
        now = now_seconds()
        assert self.verify(digest(self.body, now), ts=now, tolerance=180)
        assert not self.verify(digest(self.body, "abc"), ts="abc", tolerance=180)

    def test_tolerance_from_env(self, monkeypatch):
        old = str(int(time.time()) - 3600)
        sig = digest(self.body, old)
        monkeypatch.setenv("HUME_WEBHOOK_TOLERANCE_SECONDS", "180")
        assert not verify_hume_signature(self.body, sig, old, SECRET)


class TestHandleHumeEvent:
    def test_dispatches_chat_started_chat_ended_and_tool_call(self):
        assert handle_hume_event(CHAT_STARTED) == "chat_started"
        assert handle_hume_event(CHAT_ENDED) == "chat_ended"
        assert handle_hume_event(TOOL_CALL) == "tool_call"

    def test_unknown_event_name_is_unhandled(self):
        assert handle_hume_event({"event_name": "chat_paused"}) == "unhandled:chat_paused"


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event", [CHAT_STARTED, CHAT_ENDED, TOOL_CALL])
    def test_signed_event_returns_200(self, event):
        body = json.dumps(event).encode()
        assert post(body, sign(body)).status_code == 200

    def test_unhandled_event_name_returns_200(self):
        body = json.dumps({**CHAT_STARTED, "event_name": "chat_paused"}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_verifies_bytes_whatever_the_content_type(self):
        body = json.dumps(CHAT_STARTED).encode()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_reserialized_body(self):
        original = json.dumps(CHAT_STARTED).encode()
        pretty = json.dumps(CHAT_STARTED, indent=2).encode()
        assert post(pretty, sign(original)).status_code == 401

    def test_missing_signature_returns_401(self):
        body = json.dumps(CHAT_STARTED).encode()
        assert post(body, {"x-hume-ai-webhook-timestamp": now_seconds()}).status_code == 401

    def test_missing_timestamp_returns_401(self):
        body = json.dumps(CHAT_STARTED).encode()
        headers = {"x-hume-ai-webhook-signature": sign(body)["x-hume-ai-webhook-signature"]}
        assert post(body, headers).status_code == 401

    def test_wrong_secret_returns_401(self):
        body = json.dumps(CHAT_STARTED).encode()
        assert post(body, sign(body, secret="wrong_secret")).status_code == 401

    def test_malformed_signature_returns_401(self):
        body = json.dumps(CHAT_STARTED).encode()
        headers = {
            "x-hume-ai-webhook-signature": "not-a-digest",
            "x-hume-ai-webhook-timestamp": now_seconds(),
        }
        assert post(body, headers).status_code == 401

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400

    def test_signed_non_object_returns_400(self):
        body = b"[1,2]"
        assert post(body, sign(body)).status_code == 400


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
