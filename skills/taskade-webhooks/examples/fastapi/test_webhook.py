import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TASKADE_WEBHOOK_SECRET"] = "test_taskade_secret"

from main import app, verify_taskade_webhook

client = TestClient(app)
SECRET = os.environ["TASKADE_WEBHOOK_SECRET"]

TASK_DUE = {"event": "task.due", "task": {"id": "t_1", "title": "Ship it"}}


def generate_taskade_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Taskade signature for testing (sha256=<hex> of the raw body)."""
    return "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


class TestVerifyTaskadeWebhook:
    payload = b'{"event":"task.due"}'

    def test_valid_signature_returns_true(self):
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, SECRET), SECRET) is True

    def test_bare_digest_without_prefix_returns_true(self):
        bare = generate_taskade_signature(self.payload, SECRET)[len("sha256="):]
        assert verify_taskade_webhook(self.payload, bare, SECRET) is True

    def test_uppercase_hex_returns_true(self):
        sig = "sha256=" + generate_taskade_signature(self.payload, SECRET)[7:].upper()
        assert verify_taskade_webhook(self.payload, sig, SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_taskade_webhook(self.payload, "sha256=invalid", SECRET) is False

    def test_right_length_non_hex_returns_false(self):
        assert verify_taskade_webhook(self.payload, "sha256=" + "zz" * 32, SECRET) is False

    def test_non_ascii_signature_returns_false(self):
        assert verify_taskade_webhook(self.payload, "sha256=é" + "a" * 63, SECRET) is False

    def test_wrong_secret_returns_false(self):
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, "other"), SECRET) is False

    def test_missing_or_empty_signature_returns_false(self):
        assert verify_taskade_webhook(self.payload, None, SECRET) is False
        assert verify_taskade_webhook(self.payload, "", SECRET) is False

    def test_missing_secret_returns_false(self):
        assert verify_taskade_webhook(self.payload, generate_taskade_signature(self.payload, SECRET), None) is False

    def test_verifies_raw_bytes_not_reserialized_json(self):
        payload = b'{ "event" : "task.due",  "task": {} }'
        assert verify_taskade_webhook(payload, generate_taskade_signature(payload, SECRET), SECRET) is True


class TestTaskadeWebhookEndpoint:
    def post(self, body: bytes, headers: dict):
        return client.post("/webhooks/taskade", content=body, headers=headers)

    def test_missing_signature_returns_401(self):
        response = self.post(json.dumps(TASK_DUE).encode(), {"content-type": "application/json"})
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = self.post(
            json.dumps(TASK_DUE).encode(),
            {"content-type": "application/json", "x-taskade-signature": "sha256=invalid"},
        )
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "event", ["task.due", "task.assigned", "comment.created", "project.created", "project.joined"]
    )
    def test_valid_event_returns_200(self, event):
        body = json.dumps({"event": event}).encode()
        response = self.post(
            body,
            {"content-type": "application/json", "x-taskade-signature": generate_taskade_signature(body, SECRET)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_other_content_type_verifies(self):
        body = b'{"event":"task.due"}'
        response = self.post(
            body,
            {"content-type": "text/plain", "x-taskade-signature": generate_taskade_signature(body, SECRET)},
        )
        assert response.status_code == 200

    def test_pretty_printed_json_verifies(self):
        body = json.dumps(TASK_DUE, indent=4).encode()
        response = self.post(
            body,
            {"content-type": "application/json", "x-taskade-signature": generate_taskade_signature(body, SECRET)},
        )
        assert response.status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        response = self.post(
            body,
            {"content-type": "text/plain", "x-taskade-signature": generate_taskade_signature(body, SECRET)},
        )
        assert response.status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
