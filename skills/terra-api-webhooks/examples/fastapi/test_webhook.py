import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Terra signing secrets are used as UTF-8 bytes as-is; these are only for tests
SECRET = "test_terra_secret_5f0c1a7e"
OTHER_SECRET = "rotated_terra_secret_9d2b4c8f"
os.environ["TERRA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("TERRA_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("TERRA_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def mac(body, ts, secret=SECRET) -> str:
    body_bytes = body.encode() if isinstance(body, str) else body
    return hmac.new(secret.encode(), f"{ts}.".encode() + body_bytes, hashlib.sha256).hexdigest()


def sign(body, timestamp=None, secret=SECRET) -> str:
    """terra-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">"""
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={mac(body, ts, secret)}"


def event(event_type: str) -> str:
    return json.dumps(
        {
            "type": event_type,
            "status": "success",
            "user": {"user_id": "a1b2c3d4-0000-4000-8000-000000000001", "provider": "FITBIT", "reference_id": "u_42"},
            "data": [],
        }
    )


def post(body, headers=None, content_type="application/json"):
    data = body.encode() if isinstance(body, str) else body
    return client.post(
        "/webhooks/terra-api",
        content=data,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = event("activity")
        res = post(body, {"terra-signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_matching_v1_and_ignores_v0(self):
        body = event("sleep")
        t = int(time.time())
        header = f"t={t},v0={'0' * 64},v1={mac(body, t, OTHER_SECRET)},v1={mac(body, t)},x=1"
        assert post(body, {"terra-signature": header}).status_code == 200

    def test_rejects_v0_only(self):
        body = event("activity")
        t = int(time.time())
        assert post(body, {"terra-signature": f"t={t},v0={mac(body, t)}"}).status_code == 401

    def test_accepts_uppercase_hex(self):
        body = event("body")
        t = int(time.time())
        assert post(body, {"terra-signature": f"t={t},v1={mac(body, t).upper()}"}).status_code == 200

    def test_verifies_exact_bytes(self):
        body = '{ "type" : "activity",\n  "user": {"user_id": "é-✓"} }'
        assert post(body, {"terra-signature": sign(body)}).status_code == 200

    def test_verifies_unusual_content_type(self):
        body = event("daily")
        assert post(body, {"terra-signature": sign(body)}, "text/plain").status_code == 200

    def test_uses_t_exactly_as_sent(self):
        body = event("activity")
        t = "0001723808700"
        assert post(body, {"terra-signature": f"t={t},v1={mac(body, t)}"}).status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("activity")
        assert post(body, {"terra-signature": sign(body, secret=OTHER_SECRET)}).status_code == 401

    def test_rejects_tampered_body(self):
        body = event("activity")
        res = post(body.replace("FITBIT", "GARMIN"), {"terra-signature": sign(body)})
        assert res.status_code == 401

    def test_rejects_missing_or_empty_header(self):
        body = event("activity")
        assert post(body).status_code == 401
        assert post(body, {"terra-signature": ""}).status_code == 401

    def test_rejects_header_without_t(self):
        body = event("activity")
        assert post(body, {"terra-signature": f"v1={mac(body, 1723808700)}"}).status_code == 401
        assert post(body, {"terra-signature": f"t=,v1={mac(body, '')}"}).status_code == 401

    def test_rejects_malformed_v1_values(self):
        body = event("activity")
        t = int(time.time())
        good = mac(body, t)
        for bad in (good[:62], good + "00", "zz" + good[2:], good[:62] + "!!", ""):
            assert post(body, {"terra-signature": f"t={t},v1={bad}"}).status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("TERRA_WEBHOOK_SECRET")
        body = event("activity")
        assert post(body, {"terra-signature": sign(body)}).status_code == 500


class TestTimestampTolerance:
    def test_old_timestamps_accepted_by_default(self):
        body = event("activity")
        assert post(body, {"terra-signature": sign(body, int(time.time()) - 86400)}).status_code == 200

    def test_old_timestamps_rejected_when_enabled(self, monkeypatch):
        monkeypatch.setenv("TERRA_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("activity")
        assert post(body, {"terra-signature": sign(body, int(time.time()) - 3600)}).status_code == 401
        assert post(body, {"terra-signature": sign(body)}).status_code == 200

    def test_zero_and_non_numeric_are_off(self, monkeypatch):
        body = event("activity")
        old = sign(body, int(time.time()) - 86400)
        monkeypatch.setenv("TERRA_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert post(body, {"terra-signature": old}).status_code == 200
        monkeypatch.setenv("TERRA_WEBHOOK_TOLERANCE_SECONDS", "soon")
        assert post(body, {"terra-signature": old}).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize(
        "event_type",
        ["auth", "deauth", "user_reauth", "access_revoked", "connection_error", "activity", "sleep", "body", "daily", "athlete"],
    )
    def test_handles_known_events(self, event_type, caplog):
        caplog.set_level(logging.INFO)
        body = event(event_type)
        assert post(body, {"terra-signature": sign(body)}).status_code == 200
        assert "Unhandled event" not in caplog.text

    def test_unknown_event_returns_200(self, caplog):
        caplog.set_level(logging.INFO)
        body = event("rate_limit_hit")
        assert post(body, {"terra-signature": sign(body)}).status_code == 200
        assert "Unhandled event: rate_limit_hit" in caplog.text

    def test_non_json_body_returns_400(self):
        body = "not json"
        assert post(body, {"terra-signature": sign(body)}).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
