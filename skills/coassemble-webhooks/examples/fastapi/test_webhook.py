import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Coassemble webhook secrets are opaque strings; this one is only for tests
SECRET = "test_coassemble_secret_5f0c1a7e"
os.environ["COASSEMBLE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("COASSEMBLE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def sign(body: str, timestamp=None, secret=SECRET) -> dict:
    """Matches Coassemble's scheme: 'sha256=' + hex HMAC-SHA256 of '<timestamp>.<raw body>'."""
    ts = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return {"X-Coassemble-Signature": f"sha256={digest}", "X-Coassemble-Timestamp": str(ts)}


def event(name: str, test_mode: bool = False, **data) -> str:
    return json.dumps(
        {
            "id": "17fd9df8-c77a-4b7d-a281-267b74f8cbf3",
            "type": name,
            "occurredAt": "2026-02-22T10:15:30.000Z",
            "workspaceId": 1234,
            "testMode": test_mode,
            "data": {
                "course": {"id": 4321, "title": "Security Basics", "key": "security-basics", "clientIdentifier": "course_abc"},
                "tracking": {"id": 8888, "identifier": "user_123", "email": "user@example.com", "commenced": "2026-02-22T10:01:00.000Z", "completed": "2026-02-22T10:15:30.000Z", "totalTime": 870},
                **data,
            },
        }
    )


def post(body: str, headers=None):
    return client.post(
        "/webhooks/coassemble",
        content=body.encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_sha256_prefixed_signature(self):
        body = event("course.completed")
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_digest(self):
        body = event("course.commenced")
        h = sign(body)
        h["X-Coassemble-Signature"] = h["X-Coassemble-Signature"][len("sha256="):]
        assert post(body, h).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = event("course.completed")
        h = sign(body)
        h["X-Coassemble-Signature"] = "sha256=" + h["X-Coassemble-Signature"][7:].upper()
        assert post(body, h).status_code == 200

    def test_verifies_exact_raw_bytes(self):
        body = '{ "type" : "course.completed",\n  "data" : {} }'
        res = client.post(
            "/webhooks/coassemble", content=body.encode(), headers={"Content-Type": "text/plain", **sign(body)}
        )
        assert res.status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("course.completed")
        assert post(body, sign(body, secret="wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(event("course.commenced"), sign(event("course.completed"))).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event("course.completed")
        h = sign(body)
        h["X-Coassemble-Timestamp"] = str(int(time.time()) + 1)
        assert post(body, h).status_code == 401

    def test_rejects_missing_or_empty_signature(self):
        body = event("course.completed")
        h = sign(body)
        assert post(body, {"X-Coassemble-Timestamp": h["X-Coassemble-Timestamp"]}).status_code == 401
        assert post(body, {**h, "X-Coassemble-Signature": ""}).status_code == 401

    def test_rejects_missing_or_empty_timestamp(self):
        body = event("course.completed")
        h = sign(body)
        assert post(body, {"X-Coassemble-Signature": h["X-Coassemble-Signature"]}).status_code == 401
        assert post(body, {**h, "X-Coassemble-Timestamp": ""}).status_code == 401

    def test_rejects_malformed_signatures(self):
        body = event("course.completed")
        h = sign(body)
        good = h["X-Coassemble-Signature"][7:]
        for bad in (
            "sha256=abc123",
            "sha256=" + "zz" * 32,
            "sha256=" + good + "00",
            "sha1=" + good,
            "not-a-signature",
        ):
            res = post(body, {"X-Coassemble-Signature": bad, "X-Coassemble-Timestamp": h["X-Coassemble-Timestamp"]})
            assert res.status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("COASSEMBLE_WEBHOOK_SECRET")
        body = event("course.completed")
        assert post(body, sign(body)).status_code == 500


class TestTimestampTolerance:
    OLD = int(time.time()) - 3600

    def test_old_timestamp_accepted_by_default(self):
        body = event("course.completed")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 200

    def test_old_timestamp_rejected_when_enabled(self, monkeypatch):
        monkeypatch.setenv("COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("course.completed")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 401
        assert post(body, sign(body)).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS", "0")
        body = event("course.completed")
        assert post(body, sign(body, timestamp=self.OLD)).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize(
        "name",
        [
            "course.created",
            "course.commenced",
            "course.completed",
            "quiz.completed",
            "quiz.failed",
            "migration.progress",
            "migration.completed",
        ],
    )
    def test_handles_documented_events(self, name, caplog):
        caplog.set_level(logging.INFO, logger="coassemble-webhooks")
        body = event(name)
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event" not in caplog.text

    def test_logs_unknown_events(self, caplog):
        caplog.set_level(logging.INFO, logger="coassemble-webhooks")
        body = event("course.something.else")
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: course.something.else" in caplog.text

    def test_test_mode_events_are_acknowledged_without_action(self, caplog):
        caplog.set_level(logging.INFO, logger="coassemble-webhooks")
        body = event("course.completed", test_mode=True)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "test": True}
        assert "no action taken" in caplog.text
        assert "completed" not in caplog.text.replace("Test event course.completed", "")

    def test_invalid_json_with_valid_signature_is_400(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
