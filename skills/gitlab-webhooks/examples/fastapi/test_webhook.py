import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient
import os

# Test token (legacy secret token, sent as X-Gitlab-Token)
TEST_TOKEN = "test_gitlab_webhook_token_1234567890"
os.environ["GITLAB_WEBHOOK_TOKEN"] = TEST_TOKEN

# Signing token: 'whsec_' + base64 key. This is the key from the Standard
# Webhooks reference library's published "sign function works" test vector.
SIGNING_TOKEN = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
os.environ["GITLAB_WEBHOOK_SIGNING_TOKEN"] = SIGNING_TOKEN

import main
from main import app

client = TestClient(app)


class TestGitLabWebhookHandler:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_webhook_without_token(self):
        response = client.post(
            "/webhooks/gitlab",
            json={"object_kind": "push"}
        )
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_webhook_with_invalid_token(self):
        response = client.post(
            "/webhooks/gitlab",
            headers={"X-Gitlab-Token": "invalid_token"},
            json={"object_kind": "push"}
        )
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_webhook_with_valid_token(self):
        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Push Hook"
            },
            json={
                "object_kind": "push",
                "project": {
                    "name": "Test Project",
                    "path_with_namespace": "namespace/test-project"
                }
            }
        )
        assert response.status_code == 200
        assert response.json() == {
            "received": True,
            "event": "push",
            "project": "namespace/test-project"
        }

    def test_push_event(self):
        payload = {
            "object_kind": "push",
            "ref": "refs/heads/main",
            "before": "abcdef1234567890abcdef1234567890abcdef12",
            "after": "1234567890abcdef1234567890abcdef12345678",
            "total_commits_count": 3,
            "user_name": "John Doe",
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Push Hook",
                "X-Gitlab-Instance": "gitlab.example.com",
                "X-Gitlab-Event-UUID": "test-uuid-123"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "push"

    def test_tag_push_event(self):
        payload = {
            "object_kind": "tag_push",
            "ref": "refs/tags/v1.0.0",
            "before": "0000000000000000000000000000000000000000",
            "after": "1234567890abcdef1234567890abcdef12345678",
            "user_name": "Jane Doe",
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Tag Push Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "tag_push"

    def test_merge_request_event(self):
        payload = {
            "object_kind": "merge_request",
            "user_name": "John Doe",
            "object_attributes": {
                "iid": 42,
                "title": "Add new feature",
                "state": "opened",
                "action": "open",
                "source_branch": "feature-branch",
                "target_branch": "main"
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Merge Request Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "merge_request"

    def test_issue_event(self):
        payload = {
            "object_kind": "issue",
            "user_name": "Jane Doe",
            "object_attributes": {
                "iid": 123,
                "title": "Bug report",
                "state": "opened",
                "action": "open"
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Issue Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "issue"

    def test_work_item_event(self):
        payload = {
            "object_kind": "work_item",
            "user_name": "Jane Doe",
            "object_attributes": {
                "iid": 456,
                "title": "Task item",
                "state": "opened",
                "action": "open"
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Issue Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "work_item"

    def test_pipeline_event(self):
        payload = {
            "object_kind": "pipeline",
            "object_attributes": {
                "id": 999,
                "ref": "main",
                "status": "success",
                "duration": 3600,
                "created_at": "2024-01-01T00:00:00Z"
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Pipeline Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "pipeline"

    def test_job_event(self):
        payload = {
            "object_kind": "build",
            "build_name": "test-job",
            "build_stage": "test",
            "build_status": "success",
            "build_duration": 120,
            "project_name": "Test Project"
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Job Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "build"

    def test_note_event(self):
        payload = {
            "object_kind": "note",
            "user_name": "John Doe",
            "object_attributes": {
                "noteable_type": "MergeRequest",
                "note": "This looks good to me!"
            },
            "merge_request": {
                "iid": 42
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Note Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "note"

    def test_wiki_page_event(self):
        payload = {
            "object_kind": "wiki_page",
            "object_attributes": {
                "title": "API Documentation",
                "action": "create",
                "slug": "api-documentation"
            },
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Wiki Page Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "wiki_page"

    def test_deployment_event(self):
        payload = {
            "object_kind": "deployment",
            "status": "success",
            "environment": "production",
            "deployable_url": "https://example.com",
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Deployment Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "deployment"

    def test_release_event(self):
        payload = {
            "object_kind": "release",
            "action": "create",
            "name": "Version 1.0.0",
            "tag": "v1.0.0",
            "description": "Initial release",
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Release Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "release"

    def test_unknown_event(self):
        payload = {
            "object_kind": "unknown_event",
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Unknown Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["event"] == "unknown_event"

    def test_large_payload(self):
        # Create a payload with many commits
        commits = [
            {
                "id": f"commit{i}",
                "message": f"Commit message {i}",
                "timestamp": "2024-01-01T00:00:00Z",
                "author": {
                    "name": "Test Author",
                    "email": "test@example.com"
                }
            }
            for i in range(100)
        ]

        payload = {
            "object_kind": "push",
            "commits": commits,
            "total_commits_count": len(commits),
            "project": {
                "name": "Test Project",
                "path_with_namespace": "namespace/test-project"
            }
        }

        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "X-Gitlab-Event": "Push Hook"
            },
            json=payload
        )
        assert response.status_code == 200
        assert response.json()["received"] == True

    def test_invalid_json(self):
        response = client.post(
            "/webhooks/gitlab",
            headers={
                "X-Gitlab-Token": TEST_TOKEN,
                "Content-Type": "application/json"
            },
            content=b"invalid json"
        )
        assert response.status_code == 400  # Bad Request for invalid JSON

    def test_timing_safe_comparison(self):
        # Test with different length token
        response = client.post(
            "/webhooks/gitlab",
            headers={"X-Gitlab-Token": "short"},
            json={"object_kind": "push"}
        )
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}


def sign(webhook_id: str, timestamp: int, body: str, token: str = SIGNING_TOKEN) -> str:
    """Generate a real GitLab (Standard Webhooks) signature, independently of the app."""
    key = base64.b64decode(token.removeprefix("whsec_"))
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{body}".encode("utf-8"), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode("utf-8")


def post_signed(body: str, webhook_id="msg_test_123", timestamp=None, signature=None, extra_headers=None):
    ts = timestamp if timestamp is not None else int(time.time())
    headers = {
        "Content-Type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": signature if signature is not None else sign(webhook_id, ts, body),
        **(extra_headers or {}),
    }
    return client.post("/webhooks/gitlab", content=body.encode("utf-8"), headers=headers)


class TestGitLabSigningToken:
    def test_published_standard_webhooks_vector(self, monkeypatch):
        # Vector from standard-webhooks libraries/javascript/src/webhook.test.ts
        monkeypatch.setattr(main.time, "time", lambda: 1614265330)
        response = post_signed(
            '{"test": 2432232314}',
            webhook_id="msg_p5jXN8AQM9LWM0D4loKWxJek",
            timestamp=1614265330,
            signature="v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
        )
        assert response.status_code == 200

    def test_valid_signature_without_gitlab_token(self):
        body = json.dumps({"object_kind": "push", "project": {"path_with_namespace": "ns/p"}})
        response = post_signed(body)
        assert response.status_code == 200
        assert response.json()["event"] == "push"

    def test_one_of_several_signatures_matches(self):
        body = json.dumps({"object_kind": "push"})
        ts = int(time.time())
        signature = f"v1,bm90IHRoZSByaWdodCBzaWduYXR1cmU= {sign('msg_test_123', ts, body)}"
        assert post_signed(body, timestamp=ts, signature=signature).status_code == 200

    def test_tampered_body(self):
        ts = int(time.time())
        signature = sign("msg_test_123", ts, json.dumps({"object_kind": "push"}))
        response = post_signed(json.dumps({"object_kind": "tag_push"}), timestamp=ts, signature=signature)
        assert response.status_code == 401

    def test_wrong_signing_token(self):
        body = json.dumps({"object_kind": "push"})
        ts = int(time.time())
        other = "whsec_" + base64.b64encode(b"other_key").decode()
        response = post_signed(body, timestamp=ts, signature=sign("msg_test_123", ts, body, other))
        assert response.status_code == 401

    def test_stale_timestamp(self):
        body = json.dumps({"object_kind": "push"})
        assert post_signed(body, timestamp=int(time.time()) - 10 * 60).status_code == 401

    def test_invalid_signature_does_not_fall_back_to_token(self):
        body = json.dumps({"object_kind": "push"})
        response = post_signed(body, signature="v1,aW52YWxpZA==", extra_headers={"X-Gitlab-Token": TEST_TOKEN})
        assert response.status_code == 401

    def test_missing_webhook_id(self):
        body = json.dumps({"object_kind": "push"})
        ts = int(time.time())
        response = client.post(
            "/webhooks/gitlab",
            content=body.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "webhook-timestamp": str(ts),
                "webhook-signature": sign("msg_test_123", ts, body),
            },
        )
        assert response.status_code == 401
