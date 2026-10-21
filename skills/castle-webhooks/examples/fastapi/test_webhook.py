import base64
import hashlib
import hmac
import json
import os
from typing import Optional

os.environ["CASTLE_API_SECRET"] = "test_castle_api_secret"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_castle_signature

SECRET = os.environ["CASTLE_API_SECRET"]
client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Castle: base64(HMAC-SHA256(raw body, API secret))."""
    return base64.b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).decode()


def post(payload: bytes, signature: Optional[str] = None):
    headers = {"content-type": "application/json"}
    if signature:
        headers["x-castle-signature"] = signature
    return client.post("/webhooks/castle", content=payload, headers=headers)


class TestVerify:
    def test_valid(self):
        body = b'{"type":"$policy.matched"}'
        assert verify_castle_signature(body, sign(body), SECRET)

    def test_invalid_missing_wrong_secret(self):
        body = b"{}"
        assert not verify_castle_signature(body, "nope", SECRET)
        assert not verify_castle_signature(body, None, SECRET)
        assert not verify_castle_signature(body, sign(body, "other"), SECRET)


class TestWebhook:
    def test_missing_signature(self):
        assert post(b'{"type":"$policy.matched"}').status_code == 400

    def test_invalid_signature(self):
        assert post(b'{"type":"$policy.matched"}', "invalid").status_code == 400

    def test_modified_body(self):
        sig = sign(b'{"type":"$policy.matched"}')
        assert post(b'{"type":"$list_item.created"}', sig).status_code == 400

    def test_valid_policy_matched(self):
        payload = json.dumps({
            "api_version": "v1",
            "type": "$policy.matched",
            "data": {"policy": {"id": "p1", "name": "Trust @legit.io", "action": "allow"}},
        }).encode()
        res = post(payload, sign(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        ["$policy.matched", "$list_item.created", "$list_item.archived", "$list_item.unarchived"],
    )
    def test_documented_events(self, event_type):
        payload = json.dumps({"api_version": "v1", "type": event_type, "data": {"id": "x", "primary_value": "abc"}}).encode()
        assert post(payload, sign(payload)).status_code == 200

    def test_unknown_event_with_valid_signature(self):
        payload = b'{"type":"$unknown.event","data":{}}'
        assert post(payload, sign(payload)).status_code == 200

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
