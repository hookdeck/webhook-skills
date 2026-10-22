import json
import os

# Set test environment variables before importing the app
os.environ["LOKALISE_WEBHOOK_SECRET"] = "test_lokalise_secret_7d32ea041f77c0b9"
os.environ["LOKALISE_WEBHOOK_HEADER"] = "X-Secret"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_lokalise_request

client = TestClient(app)

SECRET = os.environ["LOKALISE_WEBHOOK_SECRET"]

# Shapes follow https://developers.lokalise.com/docs/webhook-events
PROJECT = {"id": "138c1ffa0ad94848f01f980e7f2f2af19d1bd553", "name": "TheApp Project", "branch": "master"}
USER = {"email": "john@example.com", "full_name": "John Doe"}

PAYLOADS = {
    "project.translation.updated": {
        "event": "project.translation.updated",
        "translation": {"id": 84835169, "value": "Hello, %s!", "previous_value": "Hi!", "segment": 1},
        "language": {"id": 640, "iso": "en", "name": "English"},
        "key": {"id": 16307701, "name": "test.title"},
        "project": PROJECT,
        "user": USER,
    },
    "project.translations.updated": {
        "event": "project.translations.updated",
        "action": "bulk.tm",
        "translations": [{"id": 84825168, "value": "Bonjour!", "previous_value": ""}],
        "project": PROJECT,
        "user": USER,
    },
    "project.key.added": {
        "event": "project.key.added",
        "key": {"id": 16307699, "name": "test.title", "base_value": "Hello, world!"},
        "project": PROJECT,
        "user": USER,
    },
    "project.keys.added": {
        "event": "project.keys.added",
        "action": "lokalise",
        "keys": [{"id": 28707699, "name": "test.title", "base_value": "Hello, world!"}],
        "project": PROJECT,
        "user": USER,
    },
    "project.key.modified": {"event": "project.key.modified", "key": {"id": 16307699, "name": "test.title"}, "project": PROJECT, "user": USER},
    "project.keys.modified": {"event": "project.keys.modified", "keys": [{"id": 16307699, "name": "test.title"}], "project": PROJECT, "user": USER},
    "project.keys.deleted": {"event": "project.keys.deleted", "keys": [{"id": 16307699, "name": "test.title"}], "project": PROJECT, "user": USER},
    "project.task.closed": {
        "event": "project.task.closed",
        "task": {"id": 5022, "type": "translation", "title": "Headings translation"},
        "project": PROJECT,
        "user": USER,
    },
    "project.imported": {"event": "project.imported", "project": PROJECT, "user": USER},
}


def post(headers=None, body=None):
    content = body if body is not None else json.dumps(PAYLOADS["project.translation.updated"])
    return client.post(
        "/webhooks/lokalise",
        content=content,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_correct_x_secret(self):
        res = post({"X-Secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        assert post({"x-secret": SECRET}).status_code == 200

    def test_rejects_wrong_secret_of_same_length(self):
        assert post({"X-Secret": "x" * len(SECRET)}).status_code == 401

    def test_rejects_secret_of_different_length(self):
        assert post({"X-Secret": "short"}).status_code == 401

    def test_rejects_missing_secret_header(self):
        assert post().status_code == 401

    def test_does_not_accept_secret_in_unconfigured_header(self):
        assert post({"X-Api-Key": SECRET}).status_code == 401

    def test_rejects_everything_when_no_secret_configured(self):
        assert verify_lokalise_request({"x-secret": "anything"}, {}) is False

    def test_supports_x_api_key_via_header_setting(self):
        config = {"LOKALISE_WEBHOOK_SECRET": SECRET, "LOKALISE_WEBHOOK_HEADER": "X-Api-Key"}
        assert verify_lokalise_request({"x-api-key": SECRET}, config) is True
        assert verify_lokalise_request({"x-secret": SECRET}, config) is False

    def test_supports_custom_header_name(self):
        config = {"LOKALISE_WEBHOOK_SECRET": SECRET, "LOKALISE_WEBHOOK_HEADER": "X-My-Lokalise"}
        assert verify_lokalise_request({"x-my-lokalise": SECRET}, config) is True


class TestEventHandling:
    @pytest.mark.parametrize("event", list(PAYLOADS))
    def test_handles_event(self, event):
        res = post({"X-Secret": SECRET}, json.dumps(PAYLOADS[event]))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_acknowledges_unknown_events(self):
        res = post({"X-Secret": SECRET}, json.dumps({"event": "project.something.new"}))
        assert res.status_code == 200

    def test_verifies_any_content_type(self):
        res = post(
            {"X-Secret": SECRET, "Content-Type": "text/plain"},
            json.dumps(PAYLOADS["project.keys.added"]),
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}


class TestPing:
    def test_returns_2xx_for_authenticated_empty_ping(self):
        assert post({"X-Secret": SECRET}, "").status_code == 200

    def test_returns_2xx_for_authenticated_non_json_ping(self):
        res = post({"X-Secret": SECRET}, "ping")
        assert res.status_code == 200
        assert res.json()["ignored"] is True

    def test_still_rejects_unauthenticated_ping(self):
        assert post({}, "").status_code == 401
