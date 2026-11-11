import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["BUNDLE_SOCIAL_WEBHOOK_SECRET"] = "test_bundle_social_secret"

from main import app, verify_bundle_social_signature  # noqa: E402

client = TestClient(app)

SECRET = os.environ["BUNDLE_SOCIAL_WEBHOOK_SECRET"]

POST_PUBLISHED = json.dumps(
    {
        "type": "post.published",
        "data": {
            "id": "post_abc123",
            "title": "My awesome post",
            "status": "POSTED",
            "teamId": "team_xyz",
            "organizationId": "org_123",
            "error": None,
            "errors": None,
            "externalData": {
                "INSTAGRAM": {"id": "17900000000000000", "permalink": "https://www.instagram.com/p/example/"}
            },
        },
    }
)


def sign(body: str, key: str = SECRET) -> str:
    """Sign the way bundle.social does: hex HMAC-SHA256 of the raw body."""
    return hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json", "User-Agent": "bundlesocial"}
    if signature is not None:
        headers["x-signature"] = signature
    return client.post("/webhooks/bundle-social", content=body, headers=headers)


class TestVerifySignature:
    body = POST_PUBLISHED.encode("utf-8")

    def test_valid(self):
        assert verify_bundle_social_signature(self.body, sign(POST_PUBLISHED), SECRET)

    def test_wrong_secret(self):
        assert not verify_bundle_social_signature(self.body, sign(POST_PUBLISHED, "wrong"), SECRET)

    def test_missing_signature(self):
        assert not verify_bundle_social_signature(self.body, None, SECRET)

    def test_missing_secret(self):
        assert not verify_bundle_social_signature(self.body, sign(POST_PUBLISHED), "")

    def test_non_ascii_signature(self):
        assert not verify_bundle_social_signature(self.body, "é" * 64, SECRET)


class TestEndpoint:
    def test_valid_signature(self):
        response = post(POST_PUBLISHED, sign(POST_PUBLISHED))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_signature(self):
        assert post(POST_PUBLISHED).status_code == 400

    def test_wrong_secret(self):
        assert post(POST_PUBLISHED, sign(POST_PUBLISHED, "wrong_secret")).status_code == 400

    def test_tampered_body(self):
        tampered = POST_PUBLISHED.replace("POSTED", "ERROR")
        assert post(tampered, sign(POST_PUBLISHED)).status_code == 400

    def test_exact_bytes(self):
        pretty = json.dumps(json.loads(POST_PUBLISHED), indent=2)
        assert post(pretty, sign(pretty)).status_code == 200
        assert post(POST_PUBLISHED, sign(pretty)).status_code == 400

    @pytest.mark.parametrize(
        "event_type,data",
        [
            ("post.published", {"id": "post_1", "status": "ERROR", "error": "Token expired"}),
            ("post.externally-deleted", {"id": "pp_1", "postId": "post_1", "socialAccountType": "TIKTOK"}),
            ("comment.published", {"id": "comment_1", "status": "POSTED"}),
            ("social-account.created", {"id": "sa_1", "type": "INSTAGRAM", "username": "mybrand"}),
            (
                "social-account.updated",
                {"id": "sa_1", "socialAction": {"type": "disconnect-check", "details": {"deleteOn": "2026-02-20T20:30:00.000Z"}}},
            ),
            ("social-account.deleted", {"id": "sa_1"}),
            ("team.created", {"id": "team_1", "name": "Marketing Team"}),
            ("team.updated", {"id": "team_1"}),
            ("team.deleted", {"id": "team_1"}),
            ("conversation.message.created", {"id": "msg_1"}),  # unknown to this handler: still 200
        ],
    )
    def test_events(self, event_type, data):
        body = json.dumps({"type": event_type, "data": data})
        assert post(body, sign(body)).status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
