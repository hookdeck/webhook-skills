import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_bob_webhook_secret"  # Bob secrets are used as raw strings
os.environ["HIBOB_WEBHOOK_SECRET"] = SECRET

from main import app, verify_bob_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Bob: base64(HMAC-SHA512(body, secret))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha512).digest()).decode()


def event(event_type: str) -> bytes:
    return json.dumps({
        "companyId": 1,
        "version": "v2",
        "type": event_type,
        "triggeredBy": "system",
        "triggeredAt": "2026-01-01T00:00:00Z",
        "data": {"employeeId": "3332"},
    }).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["Bob-Signature"] = signature
    return client.post("/webhooks/hibob", content=body, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        body = event("employee.created")
        assert verify_bob_signature(body, sign(body), SECRET)

    def test_invalid_inputs(self):
        body = event("employee.created")
        assert not verify_bob_signature(body, sign(body, "other"), SECRET)
        assert not verify_bob_signature(body, None, SECRET)
        assert not verify_bob_signature(body, "short", SECRET)


class TestWebhook:
    @pytest.mark.parametrize("event_type", [
        "employee.created",
        "employee.updated",
        "employee.joined",
        "employee.left",
        "timeoff.request.requested",
        "timeoff.request.approved",
        "employee.deleted",
    ])
    def test_accepts_signed_event(self, event_type):
        body = event(event_type)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_invalid_signature(self):
        assert post(event("employee.created"), "invalid").status_code == 400

    def test_rejects_missing_signature(self):
        assert post(event("employee.created")).status_code == 400

    def test_rejects_signature_for_different_body(self):
        res = post(event("employee.created"), sign(event("employee.left")))
        assert res.status_code == 400

    def test_rejects_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400

    def test_json_ping(self):
        assert post(json.dumps({"text": "Ping test"}).encode()).status_code == 200

    def test_plain_text_ping(self):
        assert post(b"Ping test", content_type="text/plain").status_code == 200
