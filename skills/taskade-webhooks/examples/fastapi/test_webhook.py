import os
import json
import hmac
import hashlib
import time
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TASKADE_WEBHOOK_SECRET"] = "test_taskade_secret"

from main import app, verify_taskade_webhook, taskade_event_type

client = TestClient(app)
SECRET = os.environ["TASKADE_WEBHOOK_SECRET"]

# Test bodies use field names from Taskade's Delivery payload table with placeholder values
BODIES = {
    "task.due": {"projectId": "p_test", "id": "n_test", "text": "test", "taskEndDate": "test"},
    "task.assigned": {"projectId": "p_test", "assignedNodes": [], "nodes": []},
    "comment.created": {"projectId": "p_test", "nodeId": "n_test", "commentBody": "test"},
    "project.created": {"projectId": "p_test", "creatorName": "test"},
    "project.assigned": {"projectId": "p_test", "assigneeId": "u_test"},
    "project.joined": {"projectId": "p_test", "joinerUserId": "u_test"},
}


def now() -> str:
    return str(int(time.time()))


def generate_taskade_signature(payload: bytes, timestamp: str, secret: str) -> str:
    """X-Taskade-Signature-V2 for testing: sha256=<hex> of "<timestamp>.<raw body>"."""
    signed = timestamp.encode() + b"." + payload
    return "sha256=" + hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


class TestVerifyTaskadeWebhook:
    payload = b'{"projectId":"p_test"}'

    def test_valid_signature_returns_true(self):
        ts = now()
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, ts, SECRET), ts, SECRET) is True

    def test_bare_digest_without_prefix_returns_true(self):
        ts = now()
        bare = generate_taskade_signature(self.payload, ts, SECRET)[len("sha256="):]
        assert verify_taskade_webhook(self.payload, bare, ts, SECRET) is True

    def test_old_timestamp_returns_false(self):
        ts = str(int(time.time()) - 301)
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, ts, SECRET), ts, SECRET) is False

    def test_body_only_signature_returns_false(self):
        body_only = "sha256=" + hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert verify_taskade_webhook(self.payload, body_only, now(), SECRET) is False

    def test_invalid_or_non_hex_signature_returns_false(self):
        ts = now()
        assert verify_taskade_webhook(self.payload, "sha256=invalid", ts, SECRET) is False
        assert verify_taskade_webhook(self.payload, "sha256=" + "zz" * 32, ts, SECRET) is False
        assert verify_taskade_webhook(self.payload, "sha256=é" + "a" * 63, ts, SECRET) is False

    def test_wrong_secret_returns_false(self):
        ts = now()
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, ts, "other"), ts, SECRET) is False

    def test_missing_headers_or_secret_returns_false(self):
        ts = now()
        sig = generate_taskade_signature(self.payload, ts, SECRET)
        assert verify_taskade_webhook(self.payload, None, ts, SECRET) is False
        assert verify_taskade_webhook(self.payload, sig, None, SECRET) is False
        assert verify_taskade_webhook(self.payload, sig, "abc", SECRET) is False
        assert verify_taskade_webhook(self.payload, sig, ts, None) is False


@pytest.mark.parametrize("event,body", list(BODIES.items()))
def test_event_type_from_fields(event, body):
    assert taskade_event_type(body) == event


def test_unrecognised_body_has_no_event_type():
    assert taskade_event_type({"projectId": "p_test"}) is None
    assert taskade_event_type([]) is None


class TestTaskadeWebhookEndpoint:
    def post(self, body: bytes, headers: dict):
        return client.post("/webhooks/taskade", content=body, headers=headers)

    def signed(self, body: bytes, content_type: str = "application/json") -> dict:
        ts = now()
        return {
            "content-type": content_type,
            "x-taskade-timestamp": ts,
            "x-taskade-signature-v2": generate_taskade_signature(body, ts, SECRET),
        }

    def test_missing_signature_returns_401(self):
        response = self.post(json.dumps(BODIES["task.due"]).encode(), {"content-type": "application/json"})
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = self.post(
            json.dumps(BODIES["task.due"]).encode(),
            {"content-type": "application/json", "x-taskade-timestamp": now(), "x-taskade-signature-v2": "sha256=invalid"},
        )
        assert response.status_code == 401

    @pytest.mark.parametrize("event", list(BODIES))
    def test_valid_delivery_returns_200(self, event):
        body = json.dumps(BODIES[event]).encode()
        response = self.post(body, self.signed(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_pretty_printed_json_verifies(self):
        body = json.dumps(BODIES["comment.created"], indent=4).encode()
        response = self.post(body, self.signed(body))
        assert response.status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        response = self.post(body, self.signed(body, "text/plain"))
        assert response.status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
