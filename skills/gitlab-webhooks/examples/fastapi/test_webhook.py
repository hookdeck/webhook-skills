import pytest
from fastapi.testclient import TestClient
import os

# Set test token
TEST_TOKEN = "test_gitlab_webhook_token_1234567890"
os.environ["GITLAB_WEBHOOK_TOKEN"] = TEST_TOKEN

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