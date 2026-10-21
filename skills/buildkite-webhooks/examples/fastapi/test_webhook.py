import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Buildkite tokens are opaque strings; this one is only for tests
TOKEN = "test_buildkite_token_309c9c842"
os.environ["BUILDKITE_WEBHOOK_TOKEN"] = TOKEN

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, timestamp=None, token=TOKEN) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    sig = hmac.new(token.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"timestamp={ts},signature={sig}"


def post(body: str, headers: dict):
    return client.post(
        "/webhooks/buildkite",
        content=body,
        headers={"Content-Type": "application/json", **headers},
    )


FINISHED = json.dumps({"event": "build.finished", "build": {"number": 7, "state": "passed"}})


class TestTokenMode:
    def test_accepts_valid_token(self):
        res = post(FINISHED, {"X-Buildkite-Event": "build.finished", "X-Buildkite-Token": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_wrong_token(self):
        assert post(FINISHED, {"X-Buildkite-Token": "nope"}).status_code == 400

    def test_rejects_token_of_different_length(self):
        assert post(FINISHED, {"X-Buildkite-Token": TOKEN + "x"}).status_code == 400

    def test_rejects_missing_headers(self):
        assert post(FINISHED, {"X-Buildkite-Event": "build.finished"}).status_code == 400


class TestSignatureMode:
    def test_accepts_valid_signature(self):
        res = post(FINISHED, {"X-Buildkite-Event": "build.finished", "X-Buildkite-Signature": sign(FINISHED)})
        assert res.status_code == 200

    def test_rejects_tampered_body(self):
        res = post(FINISHED.replace("passed", "failed"), {"X-Buildkite-Signature": sign(FINISHED)})
        assert res.status_code == 400

    def test_rejects_wrong_token(self):
        res = post(FINISHED, {"X-Buildkite-Signature": sign(FINISHED, token="other_token")})
        assert res.status_code == 400

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        # Retries and replays keep the original timestamp, so the window is off by default
        monkeypatch.delenv("BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 3600
        res = post(FINISHED, {"X-Buildkite-Signature": sign(FINISHED, timestamp=old)})
        assert res.status_code == 200

    def test_rejects_old_timestamp_when_window_set(self, monkeypatch):
        monkeypatch.setenv("BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        res = post(FINISHED, {"X-Buildkite-Signature": sign(FINISHED, timestamp=old)})
        assert res.status_code == 400

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        res = post(FINISHED, {"X-Buildkite-Signature": sign(FINISHED, timestamp=old)})
        assert res.status_code == 200

    def test_rejects_malformed_header(self):
        assert post(FINISHED, {"X-Buildkite-Signature": "garbage"}).status_code == 400

    def test_does_not_fall_back_to_token(self):
        res = post(
            FINISHED,
            {"X-Buildkite-Signature": "timestamp=1,signature=abc", "X-Buildkite-Token": TOKEN},
        )
        assert res.status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "event,payload",
        [
            ("ping", {"event": "ping", "organization": {"slug": "acme"}}),
            ("build.scheduled", {"event": "build.scheduled", "build": {"number": 1}}),
            ("build.running", {"event": "build.running", "build": {"number": 1}}),
            ("build.failing", {"event": "build.failing", "build": {"number": 1}}),
            ("build.finished", {"event": "build.finished", "build": {"number": 1, "state": "failed"}}),
            ("job.started", {"event": "job.started", "job": {"id": "j1"}}),
            ("job.finished", {"event": "job.finished", "job": {"id": "j1"}}),
            ("agent.connected", {"event": "agent.connected", "agent": {"name": "agent-1"}}),
            ("agent.lost", {"event": "agent.lost", "agent": {"name": "agent-1"}}),
        ],
    )
    def test_handles_event(self, event, payload):
        body = json.dumps(payload)
        res = post(body, {"X-Buildkite-Event": event, "X-Buildkite-Signature": sign(body)})
        assert res.status_code == 200

    def test_rejects_verified_invalid_json(self):
        body = "{not json"
        assert post(body, {"X-Buildkite-Signature": sign(body)}).status_code == 400
