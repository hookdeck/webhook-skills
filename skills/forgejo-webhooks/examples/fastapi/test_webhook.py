import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FORGEJO_WEBHOOK_SECRET"] = "test_forgejo_secret"

from main import app, verify_forgejo_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["FORGEJO_WEBHOOK_SECRET"]

# Trimmed from Forgejo's documented push example
PUSH_PAYLOAD = json.dumps({
    "ref": "refs/heads/develop",
    "before": "28e1879d029cb852e4844d9c718537df08844e03",
    "after": "bffeb74224043ba2feb48d137756c8a9331c449a",
    "commits": [{"id": "bffeb74224043ba2feb48d137756c8a9331c449a", "message": "Webhooks Yay!"}],
    "repository": {"id": 140, "name": "webhooks", "full_name": "forgejo/webhooks"},
    "pusher": {"id": 1, "login": "forgejo"},
    "sender": {"id": 1, "login": "forgejo"},
}).encode()


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Forgejo's X-Forgejo-Signature is the bare hex HMAC-SHA256 of the body."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def send(event, body: bytes, signature="__valid__", content_type="application/json"):
    headers = {"Content-Type": content_type, "X-Forgejo-Delivery": "test-delivery-id"}
    if event:
        headers["X-Forgejo-Event-Type"] = event
    if signature == "__valid__":
        signature = sign(body)
    if signature is not None:
        headers["X-Forgejo-Signature"] = signature
    return client.post("/webhooks/forgejo", content=body, headers=headers)


class TestVerifyForgejoWebhook:
    payload = b'{"action":"opened"}'

    def test_valid_signature(self):
        assert verify_forgejo_webhook(self.payload, sign(self.payload), SECRET) is True

    def test_uppercase_hex_signature(self):
        assert verify_forgejo_webhook(self.payload, sign(self.payload).upper(), SECRET) is True

    def test_wrong_secret(self):
        assert verify_forgejo_webhook(self.payload, sign(self.payload, "wrong_secret"), SECRET) is False

    @pytest.mark.parametrize("sig", [None, "", "deadbeef", "z" * 64, "sha256=" + "a" * 64, "é" * 64])
    def test_invalid_signature_format(self, sig):
        assert verify_forgejo_webhook(self.payload, sig, SECRET) is False

    def test_no_secret_configured(self):
        assert verify_forgejo_webhook(self.payload, sign(self.payload, ""), "") is False
        assert verify_forgejo_webhook(self.payload, sign(self.payload, ""), None) is False

    def test_non_utf8_body(self):
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert verify_forgejo_webhook(body, sign(body), SECRET) is True


class TestWebhookEndpoint:
    @pytest.mark.parametrize("signature", [None, "", "deadbeef", sign(PUSH_PAYLOAD, "wrong_secret")])
    def test_rejects_bad_signature(self, signature):
        assert send("push", PUSH_PAYLOAD, signature=signature).status_code == 401

    def test_rejects_modified_body(self):
        body = PUSH_PAYLOAD.replace(b"develop", b"main")
        assert send("push", body, signature=sign(PUSH_PAYLOAD)).status_code == 401

    def test_rejects_form_encoded_body(self):
        # The signature covers the JSON payload, not the form-encoded request body
        form = b"payload=" + PUSH_PAYLOAD
        response = send(
            "push", form, signature=sign(PUSH_PAYLOAD),
            content_type="application/x-www-form-urlencoded",
        )
        assert response.status_code == 401

    @pytest.mark.parametrize("event,payload", [
        ("push", json.loads(PUSH_PAYLOAD)),
        ("pull_request", {"action": "opened", "number": 1, "pull_request": {"title": "Test PR"}}),
        ("issues", {"action": "opened", "issue": {"number": 1, "title": "Test Issue"}}),
        ("issue_comment", {"action": "created", "issue": {"number": 1}, "comment": {"user": {"login": "forgejo"}}}),
        ("pull_request_comment", {"action": "created", "issue": {"number": 2}, "comment": {"user": {"login": "forgejo"}}}),
        ("create", {"ref_type": "branch", "ref": "feature"}),
        ("delete", {"ref_type": "branch", "ref": "feature"}),
        ("release", {"action": "published", "release": {"tag_name": "v1.0.0"}}),
        ("issue_assign", {"action": "assigned", "issue": {"number": 1}}),
    ])
    def test_valid_events(self, event, payload):
        response = send(event, json.dumps(payload).encode())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_any_content_type_verifies(self):
        assert send("push", PUSH_PAYLOAD, content_type="text/plain").status_code == 200

    def test_signed_non_json_body_is_400(self):
        assert send("push", b"not json").status_code == 400

    def test_signed_non_object_json_is_400(self):
        assert send("push", b"[1,2]").status_code == 400
