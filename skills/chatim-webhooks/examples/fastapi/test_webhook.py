import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Chatim webhook secrets are opaque strings; this one is only for tests
SECRET = "test_chatim_secret_5f0c1a7e"
os.environ["CHATIM_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("CHATIM_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("CHATIM_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def sign(body: str, timestamp=None, secret=SECRET) -> dict:
    """Matches Chatim's scheme: 'sha256=' + hex HMAC-SHA256 of '<timestamp>.<raw body>'."""
    ts = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return {"X-Chatim-Signature": f"sha256={digest}", "X-Chatim-Timestamp": str(ts)}


def event(name: str, **data) -> str:
    return json.dumps(
        {
            "event": name,
            "eventId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "timestamp": "2025-01-15T10:30:00.000Z",
            "projectUuid": "project-uuid",
            "chatUuid": "chat-uuid",
            "data": {"visitor": {"uuid": "visitor-uuid", "name": "John Doe"}, **data},
        }
    )


def post(body: str, headers=None):
    return client.post(
        "/webhooks/chatim",
        content=body.encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_sha256_prefixed_signature(self):
        body = event("chat.started", page={"url": "https://example.com"})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_digest(self):
        body = event("chat.closed", closedBy="agent", duration=5)
        h = sign(body)
        h["X-Chatim-Signature"] = h["X-Chatim-Signature"][len("sha256="):]
        assert post(body, h).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = event("chat.started")
        h = sign(body)
        h["X-Chatim-Signature"] = "sha256=" + h["X-Chatim-Signature"][7:].upper()
        assert post(body, h).status_code == 200

    def test_verifies_exact_raw_bytes(self):
        body = '{ "event" : "chat.started",\n  "data" : {} }'
        res = client.post(
            "/webhooks/chatim", content=body.encode(), headers={"Content-Type": "text/plain", **sign(body)}
        )
        assert res.status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("chat.started")
        assert post(body, sign(body, secret="wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(event("chat.closed"), sign(event("chat.started"))).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event("chat.started")
        h = sign(body)
        h["X-Chatim-Timestamp"] = str(int(time.time()) + 1)
        assert post(body, h).status_code == 401

    def test_rejects_missing_or_empty_signature(self):
        body = event("chat.started")
        h = sign(body)
        assert post(body, {"X-Chatim-Timestamp": h["X-Chatim-Timestamp"]}).status_code == 401
        assert post(body, {**h, "X-Chatim-Signature": ""}).status_code == 401

    def test_rejects_missing_or_empty_timestamp(self):
        body = event("chat.started")
        h = sign(body)
        assert post(body, {"X-Chatim-Signature": h["X-Chatim-Signature"]}).status_code == 401
        assert post(body, {**h, "X-Chatim-Timestamp": ""}).status_code == 401

    def test_rejects_malformed_signatures(self):
        body = event("chat.started")
        h = sign(body)
        good = h["X-Chatim-Signature"][7:]
        for bad in (
            "sha256=abc123",
            "sha256=" + "zz" * 32,
            "sha256=" + good + "00",
            "sha1=" + good,
            "not-a-signature",
        ):
            res = post(body, {"X-Chatim-Signature": bad, "X-Chatim-Timestamp": h["X-Chatim-Timestamp"]})
            assert res.status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("CHATIM_WEBHOOK_SECRET")
        body = event("chat.started")
        assert post(body, sign(body)).status_code == 500


class TestTimestampTolerance:
    OLD = int(time.time()) - 3600

    def test_old_timestamp_accepted_by_default(self):
        body = event("chat.started")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 200

    def test_old_timestamp_rejected_when_enabled(self, monkeypatch):
        monkeypatch.setenv("CHATIM_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("chat.started")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 401
        assert post(body, sign(body)).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("CHATIM_WEBHOOK_TOLERANCE_SECONDS", "0")
        body = event("chat.started")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize(
        "name",
        [
            "chat.started",
            "chat.message.received",
            "chat.form.submitted",
            "chat.closed",
            "chat.assigned",
            "chat.handoff",
        ],
    )
    def test_handles_documented_events(self, name, caplog):
        caplog.set_level(logging.INFO, logger="chatim-webhooks")
        body = event(name)
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event" not in caplog.text

    def test_logs_unknown_events(self, caplog):
        caplog.set_level(logging.INFO, logger="chatim-webhooks")
        body = event("chat.something.else")
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: chat.something.else" in caplog.text

    def test_invalid_json_with_valid_signature_is_400(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
