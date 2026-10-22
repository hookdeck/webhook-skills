import os
import json
import hmac
import hashlib
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

os.environ["GITEA_WEBHOOK_SECRET"] = "test_gitea_secret"

from main import app, verify_gitea_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["GITEA_WEBHOOK_SECRET"]


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Gitea's X-Gitea-Signature is the bare hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def send(event: str, body: bytes, signature: str | None = None,
         content_type: str = "application/json", sign_body: bool = True):
    headers = {
        "Content-Type": content_type,
        "X-Gitea-Event": event,
        "X-Gitea-Delivery": "test-delivery-id",
    }
    if signature is None and sign_body:
        signature = sign(body)
    if signature is not None:
        headers["X-Gitea-Signature"] = signature
    return client.post("/webhooks/gitea", content=body, headers=headers)


class TestVerify:
    payload = b'{"action":"opened"}'

    def test_valid(self):
        assert verify_gitea_webhook(self.payload, sign(self.payload), SECRET)

    def test_invalid(self):
        assert not verify_gitea_webhook(self.payload, "invalid", SECRET)

    def test_missing_or_empty(self):
        assert not verify_gitea_webhook(self.payload, None, SECRET)
        assert not verify_gitea_webhook(self.payload, "", SECRET)

    def test_no_secret(self):
        assert not verify_gitea_webhook(self.payload, "", "")


class TestWebhookEndpoint:
    def test_missing_signature(self):
        r = send("push", b'{"ref":"refs/heads/main"}', sign_body=False)
        assert r.status_code == 400

    def test_empty_signature(self):
        r = send("push", b'{"ref":"refs/heads/main"}', signature="")
        assert r.status_code == 400

    def test_invalid_signature(self):
        r = send("push", b'{"ref":"refs/heads/main"}', signature="deadbeef")
        assert r.status_code == 400

    def test_wrong_secret(self):
        body = b'{"ref":"refs/heads/main"}'
        r = send("push", body, signature=sign(body, "wrong_secret"))
        assert r.status_code == 400

    @pytest.mark.parametrize("event,payload", [
        ("push", {"ref": "refs/heads/main", "head_commit": {"message": "Test commit"}}),
        ("pull_request", {"action": "opened", "number": 1, "pull_request": {"title": "Test PR"}}),
        ("issues", {"action": "opened", "issue": {"number": 1, "title": "Test Issue"}}),
        ("issue_comment", {"action": "created", "issue": {"number": 1}, "comment": {"user": {"login": "octo"}}}),
        ("create", {"ref": "v1.0.0", "ref_type": "tag"}),
        ("delete", {"ref": "old-branch", "ref_type": "branch"}),
        ("release", {"action": "published", "release": {"tag_name": "v1.0.0"}}),
        ("fork", {"forkee": {}}),
    ])
    def test_valid_events(self, event, payload):
        r = send(event, json.dumps(payload).encode())
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_form_encoded_delivery(self):
        body = ("payload=" + quote(json.dumps({"ref": "refs/heads/main"}))).encode()
        r = send("push", body, content_type="application/x-www-form-urlencoded")
        assert r.status_code == 200

    def test_signed_non_json_body(self):
        r = send("push", b"not json")
        assert r.status_code == 400


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
