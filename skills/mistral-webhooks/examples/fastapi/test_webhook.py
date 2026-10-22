import hashlib
import hmac
import json
import os

os.environ["MISTRAL_WEBHOOK_SECRET"] = "test_mistral_endpoint_secret"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_mistral_webhook

SECRET = "test_mistral_endpoint_secret"
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "hmac-sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_body(event: str, data: dict) -> bytes:
    return json.dumps({"event": event, "created_at": "2026-09-08T14:32:10Z", "data": data}).encode()


EVENTS = {
    "call_started": {"session_id": "RM_1", "agent_id": "ag_1", "model": "mistral-small-latest", "started_at": 1725802330},
    "call_ended": {"session_id": "RM_1", "agent_id": "ag_1", "model": "mistral-small-latest", "duration_seconds": 212, "started_at": 1725802330, "ended_at": 1725802542, "transcript": None},
    "call_failed": {"session_id": "RM_1", "agent_id": "ag_1", "model": "mistral-small-latest", "error": "livekit_error"},
}


class TestVerify:
    body = make_body("call_started", EVENTS["call_started"])

    def test_valid(self):
        assert verify_mistral_webhook(self.body, sign(self.body), SECRET)

    def test_invalid_variants(self):
        assert not verify_mistral_webhook(self.body, sign(self.body, "other"), SECRET)
        assert not verify_mistral_webhook(self.body, sign(self.body).removeprefix("hmac-sha256="), SECRET)
        assert not verify_mistral_webhook(self.body + b" ", sign(self.body), SECRET)
        assert not verify_mistral_webhook(self.body, None, SECRET)
        assert not verify_mistral_webhook(self.body, "hmac-sha256=abc", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("event", list(EVENTS))
    def test_signed_events_accepted(self, event):
        body = make_body(event, EVENTS[event])
        res = client.post("/webhooks/mistral", content=body, headers={"x-mistral-signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

    def test_invalid_signature(self):
        body = make_body("call_started", EVENTS["call_started"])
        res = client.post("/webhooks/mistral", content=body, headers={"x-mistral-signature": sign(body, "wrong")})
        assert res.status_code == 400

    def test_missing_signature(self):
        body = make_body("call_started", EVENTS["call_started"])
        res = client.post("/webhooks/mistral", content=body)
        assert res.status_code == 400

    def test_signed_non_json(self):
        body = b"not json"
        res = client.post("/webhooks/mistral", content=body, headers={"x-mistral-signature": sign(body)})
        assert res.status_code == 400
