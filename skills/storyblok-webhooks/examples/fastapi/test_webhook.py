import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["STORYBLOK_WEBHOOK_SECRET"] = "hello"

from main import app, entity_of, verify_storyblok_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["STORYBLOK_WEBHOOK_SECRET"]


def generate_storyblok_signature(payload: str | bytes, secret: str) -> str:
    """Generate a valid Storyblok signature: hex(HMAC-SHA1(secret, rawBody))."""
    data = payload.encode("utf-8") if isinstance(payload, str) else payload
    return hmac.new(secret.encode("utf-8"), data, hashlib.sha1).hexdigest()


def post(payload, signature="__valid__", content_type="application/json"):
    body = payload if isinstance(payload, str) else json.dumps(payload)
    headers = {"content-type": content_type}
    if signature == "__valid__":
        headers["webhook-signature"] = generate_storyblok_signature(body, SECRET)
    elif signature is not None:
        headers["webhook-signature"] = signature
    return client.post("/webhooks/storyblok", content=body, headers=headers)


class TestVerifyStoryblokWebhook:
    payload = b'{"action":"published"}'

    def test_valid_signature(self):
        assert verify_storyblok_webhook(self.payload, generate_storyblok_signature(self.payload, SECRET), SECRET)

    def test_uppercase_hex_signature(self):
        sig = generate_storyblok_signature(self.payload, SECRET).upper()
        assert verify_storyblok_webhook(self.payload, sig, SECRET)

    def test_invalid_signature(self):
        assert not verify_storyblok_webhook(self.payload, "invalid", SECRET)

    def test_wrong_secret(self):
        assert not verify_storyblok_webhook(self.payload, generate_storyblok_signature(self.payload, "other"), SECRET)

    def test_altered_body(self):
        sig = generate_storyblok_signature(self.payload, SECRET)
        assert not verify_storyblok_webhook(b'{"action":"deleted"}', sig, SECRET)

    def test_missing_signature_or_secret(self):
        assert not verify_storyblok_webhook(self.payload, None, SECRET)
        assert not verify_storyblok_webhook(self.payload, generate_storyblok_signature(self.payload, SECRET), None)

    def test_sha256_signature_rejected(self):
        sha256 = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert not verify_storyblok_webhook(self.payload, sha256, SECRET)


class TestEntityOf:
    def test_distinguishes_entities_sharing_an_action(self):
        assert entity_of({"action": "deleted", "story_id": 1, "full_slug": "a"}) == "story"
        assert entity_of({"action": "deleted", "asset_id": 1}) == "asset"
        assert entity_of({"action": "created", "story_id": 1, "block_uid": "x"}) == "discussion"
        assert entity_of({"action": "stage.changed", "story_id": 1, "workflow_name": "Default"}) == "workflow"


class TestWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = post({"action": "published", "story_id": 1}, signature=None)
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}

    def test_invalid_signature_returns_400(self):
        response = post({"action": "published", "story_id": 1}, signature="deadbeef")
        assert response.status_code == 400

    def test_valid_signature_returns_json_200(self):
        response = post({
            "text": "The user a@b.co published the Story Home 2 (marketing-articles/home-2)",
            "action": "published",
            "space_id": 184738,
            "story_id": 166888799188279,
            "full_slug": "marketing-articles/home-2",
        })
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/json")
        assert response.json() == {"received": True, "event": "story.published"}

    def test_verifies_regardless_of_content_type(self):
        response = post(
            {"action": "unpublished", "space_id": 1, "story_id": 2, "full_slug": "x"},
            content_type="text/plain",
        )
        assert response.status_code == 200
        assert response.json()["event"] == "story.unpublished"

    @pytest.mark.parametrize("payload,expected", [
        ({"action": "unpublished", "space_id": 1, "story_id": 2, "full_slug": "x"}, "story.unpublished"),
        ({"action": "deleted", "space_id": 1, "story_id": 2, "full_slug": "x"}, "story.deleted"),
        ({"action": "moved", "space_id": 1, "story_id": 2, "full_slug": "b/x", "old_full_slug": "x"}, "story.moved"),
        ({"action": "entries_updated", "space_id": 1, "datasource_slug": "colors"}, "datasource.entries_updated"),
        ({"action": "entries_deleted", "space_id": 1, "datasource_slug": "colors"}, "datasource.entries_deleted"),
        ({"action": "created", "space_id": 1, "asset_id": 5}, "asset.created"),
        ({"action": "deleted", "space_id": 1, "asset_id": 5}, "asset.deleted"),
        ({"action": "stage.changed", "space_id": 1, "story_id": 2, "workflow_name": "Default", "workflow_stage_name": "Drafting"}, "workflow.stage.changed"),
        ({"action": "merged", "space_id": 1, "release_id": 9}, "release.merged"),
        ({"action": "deployed", "space_id": 1, "branch_id": 7}, "pipeline.deployed"),
    ])
    def test_dispatch(self, payload, expected):
        response = post(payload)
        assert response.status_code == 200
        assert response.json()["event"] == expected

    def test_signed_non_json_returns_400(self):
        response = post("not json")
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid JSON"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
