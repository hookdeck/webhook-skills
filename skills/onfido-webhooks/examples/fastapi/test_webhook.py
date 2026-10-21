import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Webhook tokens are opaque strings; Onfido uses the raw UTF-8 string as the HMAC key
TOKEN = "test_onfido_webhook_token"
os.environ["ONFIDO_WEBHOOK_TOKEN"] = TOKEN

from main import app, verify_onfido_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, token: str = TOKEN) -> str:
    return hmac.new(token.encode(), body, hashlib.sha256).hexdigest()


def event(action: str, resource_type: str) -> bytes:
    return json.dumps(
        {"payload": {"resource_type": resource_type, "action": action, "object": {"id": "abc123", "status": "complete"}}}
    ).encode()


def post(body: bytes, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-SHA2-Signature"] = signature
    return client.post("/webhooks/onfido", content=body, headers=headers)


class TestVerify:
    def test_valid(self):
        body = event("check.completed", "check")
        assert verify_onfido_signature(body, sign(body), TOKEN)

    def test_wrong_token(self):
        body = event("check.completed", "check")
        assert not verify_onfido_signature(body, sign(body, "other"), TOKEN)

    def test_missing_or_malformed(self):
        body = event("check.completed", "check")
        assert not verify_onfido_signature(body, None, TOKEN)
        assert not verify_onfido_signature(body, "abcd", TOKEN)
        assert not verify_onfido_signature(body, sign(body), None)


class TestEndpoint:
    @pytest.mark.parametrize(
        "action,resource_type",
        [
            ("check.completed", "check"),
            ("report.completed", "report"),
            ("workflow_run.completed", "workflow_run"),
            ("workflow_task.completed", "workflow_task"),
        ],
    )
    def test_signed_events_accepted(self, action, resource_type):
        body = event(action, resource_type)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unhandled_action_accepted(self):
        body = event("watchlist_monitor.matches_updated", "watchlist_monitor")
        assert post(body, sign(body)).status_code == 200

    def test_missing_signature(self):
        assert post(event("check.completed", "check")).status_code == 400

    def test_invalid_signature(self):
        assert post(event("check.completed", "check"), "a" * 64).status_code == 400

    def test_modified_body(self):
        body = event("check.completed", "check")
        assert post(body.replace(b"abc123", b"evil"), sign(body)).status_code == 400

    def test_raw_bytes_including_whitespace(self):
        body = b'{ "payload" :  {"resource_type":"check","action":"check.completed","object":{"id":"x"}} }'
        assert post(body, sign(body)).status_code == 200

    def test_signed_invalid_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400
