import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

TEST_SECRET = "test_shortcut_secret"

# Set before importing the app
os.environ["SHORTCUT_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_shortcut_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = TEST_SECRET) -> str:
    """Shortcut signs the raw body with HMAC-SHA256 and sends the hex digest."""
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def make_event(actions):
    return json.dumps({
        "id": "595285dc-9c43-4b9c-a1e6-0cd9aff5b084",
        "changed_at": "2017-06-27T16:20:44Z",
        "primary_id": 16927,
        "member_id": "56d8a839-1c52-437f-b981-c3a15a11d6d4",
        "version": "v1",
        "actions": actions,
        "references": [],
    })


STORY_UPDATE = make_event([{
    "id": 16927,
    "entity_type": "story",
    "action": "update",
    "name": "test story",
    "changes": {"workflow_state_id": {"new": 1495, "old": 1493}},
}])


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Payload-Signature"] = signature
    return client.post("/webhooks/shortcut", content=body.encode("utf-8"), headers=headers)


class TestVerifyShortcutWebhook:
    def test_accepts_valid_signature(self):
        raw = STORY_UPDATE.encode()
        assert verify_shortcut_webhook(raw, sign(STORY_UPDATE), TEST_SECRET)

    def test_rejects_wrong_secret(self):
        raw = STORY_UPDATE.encode()
        assert not verify_shortcut_webhook(raw, sign(STORY_UPDATE, "other"), TEST_SECRET)

    def test_rejects_tampered_body(self):
        raw = (STORY_UPDATE + " ").encode()
        assert not verify_shortcut_webhook(raw, sign(STORY_UPDATE), TEST_SECRET)

    @pytest.mark.parametrize("sig", [None, "", "not-hex", "abcd"])
    def test_rejects_missing_or_malformed(self, sig):
        assert not verify_shortcut_webhook(STORY_UPDATE.encode(), sig, TEST_SECRET)

    def test_accepts_uppercase_hex(self):
        raw = STORY_UPDATE.encode()
        assert verify_shortcut_webhook(raw, sign(STORY_UPDATE).upper(), TEST_SECRET)


class TestWebhookEndpoint:
    def test_valid_story_update(self):
        assert post(STORY_UPDATE, sign(STORY_UPDATE)).status_code == 200

    def test_any_content_type(self):
        assert post(STORY_UPDATE, sign(STORY_UPDATE), "text/plain").status_code == 200

    @pytest.mark.parametrize("kind", [
        "story create", "story delete", "epic update", "story-comment create", "label create",
    ])
    def test_acknowledges_actions(self, kind):
        entity_type, action = kind.split(" ")
        body = make_event([{"id": 1, "entity_type": entity_type, "action": action, "name": "x", "changes": {}}])
        assert post(body, sign(body)).status_code == 200

    def test_missing_signature(self):
        assert post(STORY_UPDATE).status_code == 400

    def test_invalid_signature(self):
        assert post(STORY_UPDATE, sign(STORY_UPDATE, "wrong_secret")).status_code == 400

    def test_signed_non_json(self):
        body = "not json"
        assert post(body, sign(body), "text/plain").status_code == 400
