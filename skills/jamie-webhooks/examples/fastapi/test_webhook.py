import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Jamie signing secrets are used as plain strings (not decoded), even if they look base64;
# this one is only for tests (base64 of "test_secret_key")
SECRET = "dGVzdF9zZWNyZXRfa2V5"
os.environ["JAMIE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_jamie  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("JAMIE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def v0_for(body: str, ts: int, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret: str = SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v0={v0_for(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["x-jamie-signature"] = signature
    return client.post("/webhooks/jamie", content=body, headers=headers)


def event(type_: str = "meeting.completed") -> str:
    return json.dumps(
        {
            "metadata": {"id": "7893456789012345678", "event": type_, "created": 1701234567},
            "data": {
                "title": "Q4 Planning Meeting",
                "startTime": "2024-11-27T14:00:00.000Z",
                "endTime": "2024-11-27T15:00:00.000Z",
                "user": {"id": "user-456", "email": "sarah.johnson@example.com"},
                "summary": {"markdown": "# Meeting Summary", "html": "<h1>Meeting Summary</h1>", "short": "Q4 planning"},
                "transcript": [{"speakerId": "1", "speakerName": "Sarah Johnson", "text": "Hi everyone!"}],
                "participants": [{"id": "1", "name": "Sarah Johnson", "email": "sarah.johnson@example.com"}],
                "tasks": [{"content": "Schedule follow-up", "completed": False, "assignee": None}],
                "tags": [{"name": "Planning", "color": "#50C878"}],
            },
        }
    )


@pytest.mark.parametrize("type_", ["meeting.completed", "meeting.unknown"])
def test_accepts_valid_signature(type_):
    body = event(type_)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_any_content_type():
    body = event()
    assert post(body, sign(body), "text/plain").status_code == 200


def test_secret_is_not_decoded():
    body = event()
    ts = int(time.time())
    key = base64.b64decode(SECRET)
    v0 = hmac.new(key, f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    assert post(body, f"t={ts},v0={v0}").status_code == 401


def test_accepts_v0_before_t():
    body = event()
    t, v0 = sign(body).split(",")
    assert post(body, f"{v0},{t}").status_code == 200


def test_accepts_any_matching_v0_entry():
    body = event()
    ts = int(time.time())
    assert post(body, f"t={ts},v0={'0' * 64},v0={v0_for(body, ts)}").status_code == 200


def test_rejects_tampered_body():
    body = event()
    assert post(body.replace("Q4 Planning", "Evil Planning"), sign(body)).status_code == 401


def test_rejects_wrong_secret():
    body = event()
    assert post(body, sign(body, secret="other_secret")).status_code == 401


def test_rejects_missing_signature():
    assert post(event()).status_code == 401


@pytest.mark.parametrize(
    "make",
    [
        lambda: f"t={int(time.time())}",
        lambda: f"v0={'a' * 64}",
        lambda: "not-a-signature",
        lambda: f"t=abc,v0={'a' * 64}",
        lambda: f"t={int(time.time())},v0=abcd",
    ],
    ids=["no-v0", "no-t", "garbage", "non-numeric-t", "short-v0"],
)
def test_rejects_malformed_header(make):
    assert post(event(), make()).status_code == 401


def test_rejects_invalid_json_with_valid_signature():
    body = "{not json"
    assert post(body, sign(body)).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("JAMIE_WEBHOOK_SECRET")
    body = event()
    assert post(body, sign(body)).status_code == 500


class TestTimestampWindow:
    def test_off_by_default_so_old_timestamps_verify(self):
        body = event()
        assert post(body, sign(body, int(time.time()) - 86400)).status_code == 200

    def test_rejects_older_than_300_seconds_when_opted_in(self, monkeypatch):
        monkeypatch.setenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, sign(body, int(time.time()) - 301)).status_code == 401
        assert post(body, sign(body, int(time.time()) - 120)).status_code == 200

    def test_disabled_with_zero(self, monkeypatch):
        monkeypatch.setenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS", "0")
        body = event()
        assert post(body, sign(body, int(time.time()) - 86400)).status_code == 200

    def test_custom_window(self, monkeypatch):
        monkeypatch.setenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS", "3600")
        body = event()
        assert post(body, sign(body, int(time.time()) - 1800)).status_code == 200
        assert post(body, sign(body, int(time.time()) - 7200)).status_code == 401

    def test_invalid_value_leaves_check_off(self, monkeypatch):
        monkeypatch.setenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS", "soon")
        body = event()
        assert post(body, sign(body, int(time.time()) - 1000)).status_code == 200


def test_verify_jamie_bytes():
    body = event()
    assert verify_jamie(body.encode(), sign(body), SECRET) is True
    assert verify_jamie(body.encode(), sign(body), "") is False
