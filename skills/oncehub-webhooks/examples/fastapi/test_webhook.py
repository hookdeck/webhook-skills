import hashlib
import hmac
import json
import os
import time

import pytest

# The endpoint secret (View secret in the dashboard) is used as a UTF-8 string
SECRET = "oncehub_test_secret_123"
os.environ["ONCEHUB_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_oncehub_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    s = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},s={s}"


def event(event_type: str, data=None) -> dict:
    return {
        "id": "EVNT-2AB8RJY3LF",
        "object": "event",
        "creation_time": "2021-01-20T12:10:03.140Z",
        "type": event_type,
        "api_version": "v2",
        "data": data or {"object": "booking", "id": "BKNG-YNMGHKQ24XV5"},
    }


def post(body: str, header: str | None = None):
    headers = {"Content-Type": "application/json"}
    if header:
        headers["Oncehub-Signature"] = header
    return client.post("/webhooks/oncehub", content=body, headers=headers)


class TestVerify:
    body = json.dumps(event("booking.scheduled"))

    def test_valid_signature(self):
        assert verify_oncehub_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_oncehub_webhook(self.body.encode(), sign(self.body, "other_secret"), SECRET)

    def test_tampered_body(self):
        assert not verify_oncehub_webhook((self.body + " ").encode(), sign(self.body), SECRET)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        # Retries (OnceHub's, Hookdeck's) keep the original t
        monkeypatch.delenv("ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_oncehub_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_oncehub_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=300)

    def test_old_timestamp_rejected_when_window_set(self, monkeypatch):
        monkeypatch.setenv("ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_oncehub_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_oncehub_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_stale_timestamp_with_wider_tolerance(self):
        old = int(time.time()) - 600
        assert verify_oncehub_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=3600)

    def test_malformed_headers(self):
        for bad in ["garbage", "t=abc,s=00", f"t={int(time.time())}", None, ""]:
            assert not verify_oncehub_webhook(self.body.encode(), bad, SECRET)

    def test_any_s_signature_matches(self):
        assert verify_oncehub_webhook(self.body.encode(), f"{sign(self.body)},s=deadbeef", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("event_type", [
        "booking.scheduled",
        "booking.rescheduled",
        "booking.reassigned",
        "booking.canceled_then_rescheduled",
        "booking.canceled_reschedule_requested",
        "booking.canceled",
        "booking.completed",
        "booking.no_show",
        "conversation.started",
        "conversation.closed",
        "conversation.abandoned",
        "something.new",
    ])
    def test_valid_event(self, event_type):
        body = json.dumps(event(event_type))
        assert post(body, sign(body)).status_code == 200

    def test_invalid_signature(self):
        body = json.dumps(event("booking.scheduled"))
        assert post(body, sign(body, "wrong_secret")).status_code == 400

    def test_missing_header(self):
        assert post(json.dumps(event("booking.scheduled"))).status_code == 400

    def test_signed_non_object(self):
        body = json.dumps([event("booking.scheduled")])
        assert post(body, sign(body)).status_code == 400

    def test_signed_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
