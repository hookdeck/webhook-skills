import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

SECRET = "test_cartesia_webhook_secret_0123456789"
os.environ["CARTESIA_WEBHOOK_SECRET"] = SECRET

from main import app, verify_cartesia_request  # noqa: E402

client = TestClient(app)


def sample_payload(event_type="call_completed", request_id=None):
    """Shapes follow the Cartesia docs' envelope."""
    base = {
        "type": event_type,
        "call_id": "ac_test_123",
        "agent_id": "agent_demo",
        "webhook_id": "agent_webhook_test",
        "webhook_request_id": request_id or f"webhook_req_{uuid.uuid4().hex}",
        "timestamp": "2026-01-01T00:00:00.000000000Z",
    }
    if event_type == "call_turn":
        return {**base, "turn": {"id": 0, "role": "user", "text": "Hello"}}
    if event_type == "post_call_analysis":
        return {**base, "analysis": {"summary": "A short call."}}
    return {
        **base,
        "call": {"id": "ac_test_123", "status": event_type.replace("call_", ""), "end_reason": "client_hangup"},
    }


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/cartesia", content=body, headers=all_headers)


class TestSecretVerification:
    def test_accepts_correct_secret(self):
        res = post(headers={"x-webhook-secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_secret_of_same_length(self):
        assert post(headers={"x-webhook-secret": "x" * len(SECRET)}).status_code == 401

    def test_rejects_secret_of_different_length(self):
        assert post(headers={"x-webhook-secret": "short"}).status_code == 401

    def test_does_not_accept_prefixed_secret(self):
        assert post(headers={"x-webhook-secret": f"Bearer {SECRET}"}).status_code == 401

    def test_verifies_regardless_of_content_type(self):
        res = post(headers={"x-webhook-secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200


class TestRequestHandling:
    def test_invalid_json_returns_400(self):
        assert post("{not json", {"x-webhook-secret": SECRET}).status_code == 400

    def test_non_object_json_returns_400(self):
        assert post("[1,2,3]", {"x-webhook-secret": SECRET}).status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        ["call_started", "call_completed", "call_failed", "call_turn", "post_call_analysis", "something_else"],
    )
    def test_handles_event_types(self, event_type):
        res = post(json.dumps(sample_payload(event_type)), {"x-webhook-secret": SECRET})
        assert res.status_code == 200
        assert "duplicate" not in res.json()

    def test_skips_retried_event(self):
        body = json.dumps(sample_payload("call_started", "webhook_req_retry_1"))
        first = post(body, {"x-webhook-secret": SECRET})
        second = post(body, {"x-webhook-secret": SECRET})
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}


class TestVerifyCartesiaRequest:
    def test_rejects_when_unconfigured(self):
        assert verify_cartesia_request({"x-webhook-secret": "anything"}, "") is False

    def test_match_and_mismatch(self):
        assert verify_cartesia_request({"x-webhook-secret": "s3cret"}, "s3cret") is True
        assert verify_cartesia_request({"x-webhook-secret": "s3cre7"}, "s3cret") is False


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
