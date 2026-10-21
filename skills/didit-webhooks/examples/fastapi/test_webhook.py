# Generated with: didit-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Didit FastAPI webhook receiver.

Signatures are generated with Didit's real algorithm: hex HMAC-SHA256 of the
raw body, keyed with the destination's secret_shared_key (a raw string).
"""

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app, tolerance_from_env, verify_didit_signature

client = TestClient(app)

SECRET = "didit_test_secret_shared_key_1234567890"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("DIDIT_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def session_event(webhook_type: str, status: str, **extra) -> bytes:
    # Didit serialises with sorted keys and compact separators.
    payload = {
        "application_id": "11111111-2222-3333-4444-555555555555",
        "created_at": int(time.time()) - 5,
        "environment": "live",
        "event_id": "9c0c8b8a-1111-4222-9333-444444444444",
        "session_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "status": status,
        "timestamp": int(time.time()),
        "vendor_data": "user_42",
        "webhook_type": webhook_type,
        **extra,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def post(body: bytes, signature="auto", timestamp="auto"):
    headers = {"content-type": "application/json"}
    if signature == "auto":
        signature = sign(body)
    if timestamp == "auto":
        timestamp = str(int(time.time()))
    if signature is not None:
        headers["x-signature"] = signature
    if timestamp is not None:
        headers["x-timestamp"] = timestamp
    return client.post("/webhooks/didit", content=body, headers=headers)


class TestVerifyDiditSignature:
    body = session_event("status.updated", "Approved")
    now = float(int(time.time()))

    def test_accepts_valid(self):
        ok, err = verify_didit_signature(self.body, sign(self.body), str(int(self.now)), SECRET, 300, self.now)
        assert ok and err is None

    def test_rejects_wrong_secret(self):
        ok, _ = verify_didit_signature(self.body, sign(self.body, "other"), str(int(self.now)), SECRET, 300, self.now)
        assert not ok

    def test_rejects_modified_body(self):
        ok, _ = verify_didit_signature(self.body + b" ", sign(self.body), str(int(self.now)), SECRET, 300, self.now)
        assert not ok

    def test_rejects_wrong_length_signature(self):
        ok, _ = verify_didit_signature(self.body, "abc", str(int(self.now)), SECRET, 300, self.now)
        assert not ok

    def test_rejects_stale_timestamp(self):
        ok, err = verify_didit_signature(self.body, sign(self.body), str(int(self.now) - 301), SECRET, 300, self.now)
        assert not ok and "tolerance" in err.lower()

    def test_rejects_future_timestamp(self):
        ok, _ = verify_didit_signature(self.body, sign(self.body), str(int(self.now) + 301), SECRET, 300, self.now)
        assert not ok

    def test_accepts_edge_of_window(self):
        ok, _ = verify_didit_signature(self.body, sign(self.body), str(int(self.now) - 300), SECRET, 300, self.now)
        assert ok

    def test_rejects_missing_timestamp(self):
        ok, _ = verify_didit_signature(self.body, sign(self.body), None, SECRET, 300, self.now)
        assert not ok

    def test_zero_tolerance_skips_timestamp(self):
        ok, _ = verify_didit_signature(self.body, sign(self.body), "1", SECRET, 0, self.now)
        assert ok

    def test_rejects_missing_signature(self):
        ok, _ = verify_didit_signature(self.body, None, str(int(self.now)), SECRET, 300, self.now)
        assert not ok


class TestToleranceFromEnv:
    def test_default(self, monkeypatch):
        monkeypatch.delenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        assert tolerance_from_env() == 0

    def test_configured(self, monkeypatch):
        monkeypatch.setenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", "60")
        assert tolerance_from_env() == 60

    def test_garbage_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", "abc")
        assert tolerance_from_env() == 0
        monkeypatch.setenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", "5min")
        assert tolerance_from_env() == 0


class TestWebhookEndpoint:
    def test_accepts_status_updated(self, capsys):
        res = post(session_event("status.updated", "Approved"))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "is now Approved" in capsys.readouterr().out

    def test_accepts_data_updated(self, capsys):
        res = post(session_event("data.updated", "Approved", trigger="manual_review"))
        assert res.status_code == 200
        assert "data updated" in capsys.readouterr().out

    def test_acknowledges_unhandled_event(self, capsys):
        res = post(session_event("user.status.updated", "BLOCKED"))
        assert res.status_code == 200
        assert "Unhandled Didit event: user.status.updated" in capsys.readouterr().out

    def test_verifies_exact_raw_bytes_with_unicode_escape(self):
        # Didit's X-Signature covers ensure_ascii=True output, so é stays escaped.
        body = json.dumps(
            {"event_id": "e1", "status": "Approved", "vendor_data": "José", "webhook_type": "status.updated"},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        assert b"\\u00e9" in body
        assert post(body).status_code == 200

    def test_rejects_invalid_signature(self):
        body = session_event("status.updated", "Approved")
        assert post(body, signature=sign(body, "wrong_secret")).status_code == 400

    def test_rejects_tampered_body(self):
        body = session_event("status.updated", "Declined")
        assert post(body.replace(b"Declined", b"Approved"), signature=sign(body)).status_code == 400

    def test_rejects_missing_signature(self):
        assert post(session_event("status.updated", "Approved"), signature=None).status_code == 400

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        # Hookdeck retries and replays keep the original X-Timestamp
        monkeypatch.delenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        body = session_event("status.updated", "Approved")
        assert post(body, timestamp=str(int(time.time()) - 86400)).status_code == 200

    def test_rejects_stale_timestamp_when_window_set(self, monkeypatch):
        monkeypatch.setenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = session_event("status.updated", "Approved")
        assert post(body, timestamp=str(int(time.time()) - 600)).status_code == 400

    def test_rejects_non_json_body(self):
        res = post(b"not json")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("DIDIT_WEBHOOK_SECRET")
        assert post(session_event("status.updated", "Approved")).status_code == 500
