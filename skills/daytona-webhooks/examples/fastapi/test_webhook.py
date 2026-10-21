# Generated with: daytona-webhooks skill
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
SECRET = "whsec_" + base64.b64encode(b"daytona-test-signing-key-0123456").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-endpoint-signing-key0").decode()

os.environ["DAYTONA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Svix: HMAC-SHA256 over `{id}.{timestamp}.{body}`, base64."""
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
    return client.post("/webhooks/daytona", content=raw_body, headers=headers)


TS = "2025-12-19T10:30:00.000Z"
EVENTS = {
    "sandbox.created": {"id": "sandbox123", "organizationId": "org123", "state": "started", "sandboxClass": "container", "createdAt": TS},
    "sandbox.state.updated": {"id": "sandbox123", "organizationId": "org123", "oldState": "started", "newState": "stopped", "updatedAt": TS},
    "snapshot.created": {"id": "snapshot123", "name": "my-snapshot", "organizationId": "org123", "state": "active", "createdAt": TS},
    "snapshot.state.updated": {"id": "snapshot123", "name": "my-snapshot", "organizationId": "org123", "oldState": "building", "newState": "active", "updatedAt": TS},
    "snapshot.removed": {"id": "snapshot123", "name": "my-snapshot", "organizationId": "org123", "removedAt": TS},
    "volume.created": {"id": "vol-12345678", "name": "my-volume", "organizationId": "org123", "state": "ready", "createdAt": TS},
    "volume.state.updated": {"id": "vol-12345678", "name": "my-volume", "organizationId": "org123", "oldState": "creating", "newState": "ready", "updatedAt": TS},
}


def body(event: str) -> str:
    return json.dumps({"event": event, "timestamp": TS, **EVENTS[event]})


class TestValidSignatures:
    @pytest.mark.parametrize("event", list(EVENTS))
    def test_accepts_event(self, event):
        raw = body(event)
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_when_one_of_several_signatures_matches(self):
        raw = body("sandbox.created")
        msg_id, ts = "msg_multi", str(now())
        signature = f"v1,{base64.b64encode(b'bogus').decode()} {sign(raw, msg_id, ts)}"
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 200

    def test_unhandled_event_type_is_acknowledged(self, caplog):
        raw = json.dumps({"event": "sandbox.deleted", "timestamp": TS})
        with caplog.at_level(logging.INFO, logger="daytona-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Daytona event: sandbox.deleted" in caplog.text


class TestInvalidRequests:
    def test_rejects_wrong_secret(self):
        raw = body("sandbox.created")
        assert post(raw, signed_headers(raw, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_tampered_body(self):
        raw = body("sandbox.created")
        headers = signed_headers(raw)
        assert post(raw.replace("sandbox123", "sandbox999"), headers).status_code == 400

    def test_rejects_reserialised_body(self):
        raw = body("sandbox.created")
        headers = signed_headers(raw)
        assert post(json.dumps(json.loads(raw), indent=2), headers).status_code == 400

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        # Retries and replays keep the original timestamp, so the window is off by default
        monkeypatch.delenv("DAYTONA_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = now() - 3600
        raw = body("sandbox.created")
        res = post(raw, signed_headers(raw, timestamp=old))
        assert res.status_code == 200

    def test_rejects_old_timestamp_when_window_set(self, monkeypatch):
        monkeypatch.setenv("DAYTONA_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = now() - 3600
        raw = body("sandbox.created")
        res = post(raw, signed_headers(raw, timestamp=old))
        assert res.status_code == 400

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("DAYTONA_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = now() - 3600
        raw = body("sandbox.created")
        res = post(raw, signed_headers(raw, timestamp=old))
        assert res.status_code == 200

    def test_rejects_malformed_signature(self):
        raw = body("sandbox.created")
        assert post(raw, signed_headers(raw, signature="v1,not-a-real-signature")).status_code == 400

    @pytest.mark.parametrize("name", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, name):
        raw = body("sandbox.created")
        headers = signed_headers(raw)
        del headers[name]
        res = post(raw, headers)
        assert res.status_code == 400
        assert "Missing" in res.json()["detail"]


class TestDeduplication:
    def test_repeated_svix_id_is_acknowledged_without_reprocessing(self, caplog):
        raw = body("snapshot.created")
        headers = signed_headers(raw, msg_id="msg_dupe_1")
        assert post(raw, headers).json() == {"received": True}
        with caplog.at_level(logging.INFO, logger="daytona-webhooks"):
            res = post(raw, headers)
        assert res.status_code == 200
        assert res.json() == {"received": True, "duplicate": True}
        assert "Snapshot" not in caplog.text


class TestConfiguration:
    def test_fails_closed_without_secret(self, monkeypatch):
        raw = body("sandbox.created")
        headers = signed_headers(raw)
        monkeypatch.delenv("DAYTONA_WEBHOOK_SECRET")
        assert post(raw, headers).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
