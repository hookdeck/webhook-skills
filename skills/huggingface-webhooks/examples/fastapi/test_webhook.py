import os

# Set test secret before importing the app
TEST_SECRET = "test_huggingface_webhook_secret_1234567890"
os.environ["HUGGINGFACE_WEBHOOK_SECRET"] = TEST_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def build_payload(scope: str, action: str, **overrides):
    payload = {
        "event": {"action": action, "scope": scope},
        "repo": {
            "type": "model",
            "name": "openai-community/gpt2",
            "id": "621ffdc036468d709f17434d",
            "private": False,
            "url": {
                "web": "https://huggingface.co/openai-community/gpt2",
                "api": "https://huggingface.co/api/models/openai-community/gpt2",
            },
            "headSha": "c379e821c9c95d613899e8c4343e4bfee2b0c600",
            "owner": {"id": "628b753283ef59b5be89e937"},
        },
        "webhook": {"id": "6390e855e30d9209411de93b", "version": 3},
    }
    payload.update(overrides)
    return payload


class TestHuggingFaceWebhookHandler:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_webhook_without_secret(self):
        response = client.post(
            "/webhooks/huggingface", json=build_payload("repo", "update")
        )
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_webhook_with_wrong_secret(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": "wrong_secret"},
            json=build_payload("repo", "update"),
        )
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_webhook_with_different_length_secret(self):
        # Exercises the timing-safe comparison path.
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": "short"},
            json=build_payload("repo", "update"),
        )
        assert response.status_code == 401

    def test_webhook_with_valid_header(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=build_payload("repo", "update"),
        )
        assert response.status_code == 200
        assert response.json() == {
            "received": True,
            "event": "repo.update",
            "repo": "openai-community/gpt2",
        }

    def test_webhook_with_valid_query_param(self):
        response = client.post(
            f"/webhooks/huggingface?secret={TEST_SECRET}",
            json=build_payload("repo", "update"),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["received"] is True
        assert body["event"] == "repo.update"

    def test_invalid_payload_missing_event(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json={"repo": {"type": "model", "name": "x/y"}},
        )
        assert response.status_code == 400
        assert response.json() == {"error": "Invalid payload"}

    def test_invalid_json(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={
                "X-Webhook-Secret": TEST_SECRET,
                "Content-Type": "application/json",
            },
            content=b"not-json{",
        )
        assert response.status_code == 400
        assert response.json() == {"error": "Invalid JSON"}

    # --- scope=repo ---

    def test_repo_create(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=build_payload("repo", "create"),
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.create"

    def test_repo_update(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=build_payload("repo", "update"),
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.update"

    def test_repo_delete(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=build_payload("repo", "delete"),
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.delete"

    def test_repo_move(self):
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=build_payload("repo", "move"),
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.move"

    # --- scope=repo.content ---

    def test_repo_content_update_with_refs(self):
        payload = build_payload(
            "repo.content",
            "update",
            updatedRefs=[
                {
                    "ref": "refs/heads/main",
                    "oldSha": "ce9a4674fa833a68d5a73ec355f0ea95eedd60b7",
                    "newSha": "575db8b7a51b6f85eb06eee540738584589f131c",
                },
                {
                    "ref": "refs/tags/v1",
                    "oldSha": None,
                    "newSha": "575db8b7a51b6f85eb06eee540738584589f131c",
                },
                {
                    "ref": "refs/heads/old",
                    "oldSha": "aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa",
                    "newSha": None,
                },
            ],
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.content.update"

    # --- scope=repo.config ---

    def test_repo_config_update(self):
        payload = build_payload(
            "repo.config", "update", updatedConfig={"private": True}
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.config.update"

    def test_repo_config_update_empty(self):
        payload = build_payload("repo.config", "update", updatedConfig={})
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.config.update"

    # --- scope=discussion ---

    def test_discussion_create_pull_request(self):
        payload = build_payload(
            "discussion",
            "create",
            discussion={
                "id": "6399f58518721fdd27fc9ca9",
                "title": "Update co2 emissions",
                "url": {"web": "...", "api": "..."},
                "status": "open",
                "author": {"id": "61d2f90c3c2083e1c08af22d"},
                "num": 19,
                "isPullRequest": True,
                "changes": {"base": "refs/heads/main"},
            },
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "discussion.create"

    def test_discussion_update(self):
        payload = build_payload(
            "discussion",
            "update",
            discussion={
                "id": "abc",
                "title": "New title",
                "url": {"web": "", "api": ""},
                "status": "closed",
                "author": {"id": "u1"},
                "num": 7,
                "isPullRequest": False,
            },
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "discussion.update"

    def test_discussion_delete(self):
        payload = build_payload(
            "discussion",
            "delete",
            discussion={
                "id": "abc",
                "title": "Spam",
                "url": {"web": "", "api": ""},
                "status": "closed",
                "author": {"id": "u1"},
                "num": 9,
                "isPullRequest": False,
            },
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "discussion.delete"

    # --- scope=discussion.comment ---

    def test_discussion_comment_create(self):
        payload = build_payload(
            "discussion.comment",
            "create",
            discussion={
                "id": "abc",
                "title": "t",
                "url": {"web": "", "api": ""},
                "status": "open",
                "author": {"id": "u1"},
                "num": 1,
                "isPullRequest": False,
            },
            comment={
                "id": "c1",
                "author": {"id": "u2"},
                "content": "Looks good!",
                "hidden": False,
                "url": {"web": ""},
            },
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "discussion.comment.create"

    def test_discussion_comment_hidden(self):
        payload = build_payload(
            "discussion.comment",
            "update",
            comment={
                "id": "c1",
                "author": {"id": "u2"},
                "hidden": True,
                "url": {"web": ""},
            },
        )
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "discussion.comment.update"

    # --- forward-compat ---

    def test_unknown_narrowed_scope(self):
        payload = build_payload("repo.config.dois", "update", updatedConfig={})
        response = client.post(
            "/webhooks/huggingface",
            headers={"X-Webhook-Secret": TEST_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["event"] == "repo.config.dois.update"
