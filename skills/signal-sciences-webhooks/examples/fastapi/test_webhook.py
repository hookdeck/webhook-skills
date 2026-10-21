import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Signing keys are used as raw strings (no encoding or prefix)
SIGNING_KEY = "test_signing_key"
os.environ["SIGNAL_SCIENCES_SIGNING_KEY"] = SIGNING_KEY

from main import app, verify_signal_sciences_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, key: str = SIGNING_KEY) -> str:
    """Same algorithm as Fastly: hex HMAC-SHA256 of the raw JSON body."""
    return hmac.new(key.encode(), payload, hashlib.sha256).hexdigest()


def make_event(event_type: str, payload: dict | None = None) -> bytes:
    return json.dumps({
        "created": "2024-02-09T21:08:21.31644377Z",
        "type": event_type,
        "payload": payload or {},
        "link": "dashboard link to event",
        "workspaceId": "www.mysite.com",
    }).encode()


def post(body: bytes, signature: str | None = None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-SigSci-Signature"] = signature
    return client.post("/webhooks/signal-sciences", content=body, headers=headers)


class TestVerify:
    body = make_event("flag")

    def test_valid_signature(self):
        assert verify_signal_sciences_webhook(self.body, sign(self.body), SIGNING_KEY)

    def test_wrong_key(self):
        assert not verify_signal_sciences_webhook(self.body, sign(self.body, "other"), SIGNING_KEY)

    def test_tampered_body(self):
        assert not verify_signal_sciences_webhook(make_event("agentAlert"), sign(self.body), SIGNING_KEY)

    def test_missing_or_malformed(self):
        assert not verify_signal_sciences_webhook(self.body, None, SIGNING_KEY)
        assert not verify_signal_sciences_webhook(self.body, "not-hex", SIGNING_KEY)


class TestWebhookEndpoint:
    def test_missing_signature(self):
        assert post(make_event("flag")).status_code == 400

    def test_invalid_signature(self):
        assert post(make_event("flag"), "a" * 64).status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        ["flag", "expireFlag", "agentAlert", "loggingModeChanged", "ruleCreated", "listDeleted"],
    )
    def test_valid_events(self, event_type):
        body = make_event(event_type, {"ID": "abcde123456789", "Slug": "site.example"})
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unhandled_event(self):
        body = make_event("customDashboardCreated")
        assert post(body, sign(body)).status_code == 200

    def test_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
