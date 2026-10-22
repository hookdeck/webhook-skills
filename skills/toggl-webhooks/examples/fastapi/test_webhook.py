import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

# Docs test vector (engineering.toggl.com "Validating Received Events")
DOCS_SECRET = "PGuRrhCFajIyEvFlreKL"
DOCS_PING_BODY = (
    '{"event_id":0,"created_at":"2022-06-25T03:58:10.207820267Z","creator_id":6,'
    '"metadata":{"request_type":"POST","event_user_id":6},"payload":"ping",'
    '"subscription_id":6,"timestamp":"2022-06-25T03:58:10.207820267Z",'
    '"url_callback":"https://callback-url.com"}'
).encode()
DOCS_PING_SIGNATURE = "sha256=bf829606cda0ca6923defb5ca70a43135adc7e8887486a201a19cb50ca6006b1"

# Set test environment variables before importing the app.
os.environ["TOGGL_WEBHOOK_SECRET"] = DOCS_SECRET

from main import app, verify_toggl_webhook

client = TestClient(app)


def sign(body: bytes, secret: str = DOCS_SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def entity_event(model: str, action: str, payload: dict | None = None) -> bytes:
    return json.dumps(
        {
            "event_id": 42,
            "creator_id": 6,
            "metadata": {"action": action, "model": model, "event_user_id": 6, "request_type": "POST"},
            "payload": payload or {},
            "subscription_id": 6,
            "timestamp": "2024-01-01T00:00:00Z",
            "url_callback": "https://callback-url.com",
        }
    ).encode()


class TestVerify:
    def test_docs_test_vector(self):
        assert verify_toggl_webhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE, DOCS_SECRET)

    def test_rejects_bad_inputs(self):
        assert not verify_toggl_webhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE, "other")
        assert not verify_toggl_webhook(DOCS_PING_BODY + b" ", DOCS_PING_SIGNATURE, DOCS_SECRET)
        assert not verify_toggl_webhook(DOCS_PING_BODY, None, DOCS_SECRET)
        assert not verify_toggl_webhook(DOCS_PING_BODY, "sha256=short", DOCS_SECRET)
        assert not verify_toggl_webhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE.removeprefix("sha256="), DOCS_SECRET)


class TestEndpoint:
    def post(self, body: bytes, signature: str | None = None, content_type: str = "application/json"):
        headers = {"Content-Type": content_type}
        if signature:
            headers["X-Webhook-Signature-256"] = signature
        return client.post("/webhooks/toggl", content=body, headers=headers)

    def test_missing_signature(self):
        assert self.post(DOCS_PING_BODY).status_code == 400

    def test_invalid_signature(self):
        assert self.post(DOCS_PING_BODY, "sha256=" + "a" * 64).status_code == 400

    def test_docs_ping(self):
        res = self.post(DOCS_PING_BODY, DOCS_PING_SIGNATURE)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_validation_code_echoed(self):
        body = json.dumps({**json.loads(DOCS_PING_BODY), "validation_code": "abc123"}).encode()
        res = self.post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"validation_code": "abc123"}

    def test_any_content_type_verifies(self):
        body = entity_event("time_entry", "created", {"description": "Work"})
        assert self.post(body, sign(body), "text/plain").status_code == 200

    @pytest.mark.parametrize(
        "model,action",
        [
            ("time_entry", "created"),
            ("time_entry", "updated"),
            ("time_entry", "deleted"),
            ("project", "created"),
            ("project", "updated"),
            ("project", "deleted"),
            ("tag", "created"),
        ],
    )
    def test_entity_events(self, model, action):
        body = entity_event(model, action, {"id": 1, "name": "x", "description": "y"})
        res = self.post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_signed_non_json(self):
        body = b"not json"
        assert self.post(body, sign(body), "text/plain").status_code == 400
