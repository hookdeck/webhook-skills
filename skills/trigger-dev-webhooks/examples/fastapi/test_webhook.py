from __future__ import annotations

import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["TRIGGER_DEV_WEBHOOK_SECRET"] = "test_trigger_dev_alert_secret"

from main import app, verify_trigger_dev_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["TRIGGER_DEV_WEBHOOK_SECRET"]
HEADER = "x-trigger-signature-hmacsha256"


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Bare hex HMAC-SHA256 of the raw body, keyed with the secret as UTF-8."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def post(payload: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature:
        headers[HEADER] = signature
    return client.post("/webhooks/trigger-dev", content=payload, headers=headers)


BASE = {"id": "evt_1", "created": "2026-01-01T00:00:00.000Z", "webhookVersion": "2025-01-01"}

EVENTS = {
    "alert.run.failed": {
        **BASE,
        "type": "alert.run.failed",
        "object": {"task": {"id": "my-task"}, "run": {"id": "run_1"}},
    },
    "alert.deployment.success": {
        **BASE,
        "type": "alert.deployment.success",
        "object": {"deployment": {"version": "20260101.1"}},
    },
    "alert.deployment.failed": {
        **BASE,
        "type": "alert.deployment.failed",
        "object": {"deployment": {"version": "20260101.2"}, "error": {"name": "BuildError", "message": "boom"}},
    },
    "alert.error": {
        **BASE,
        "type": "alert.error",
        "object": {"classification": "new_issue", "error": {"fingerprint": "abc", "message": "oops"}},
    },
}


class TestVerify:
    def test_valid(self):
        body = b'{"type":"alert.run.failed"}'
        assert verify_trigger_dev_webhook(body, sign(body), SECRET)

    def test_invalid(self):
        assert not verify_trigger_dev_webhook(b"{}", "invalid", SECRET)

    def test_wrong_secret(self):
        body = b"{}"
        assert not verify_trigger_dev_webhook(body, sign(body, "other"), SECRET)

    def test_missing(self):
        assert not verify_trigger_dev_webhook(b"{}", None, SECRET)


class TestEndpoint:
    def test_missing_signature(self):
        res = post(json.dumps(EVENTS["alert.run.failed"]).encode())
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature header"

    def test_invalid_signature(self):
        res = post(json.dumps(EVENTS["alert.run.failed"]).encode(), "a" * 64)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_modified_body(self):
        payload = json.dumps(EVENTS["alert.run.failed"]).encode()
        assert post(payload + b" ", sign(payload)).status_code == 400

    @pytest.mark.parametrize("event_type", list(EVENTS))
    def test_events(self, event_type):
        payload = json.dumps(EVENTS[event_type]).encode()
        res = post(payload, sign(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        payload = json.dumps(EVENTS["alert.deployment.success"]).encode()
        assert post(payload, sign(payload), "text/plain").status_code == 200

    def test_unknown_event(self):
        payload = json.dumps({**BASE, "type": "alert.future", "object": {}}).encode()
        assert post(payload, sign(payload)).status_code == 200

    def test_signed_non_json(self):
        payload = b"not json"
        assert post(payload, sign(payload), "text/plain").status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
