import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
SECRET = "test_jfrog_secret_token_0123456789"
os.environ["JFROG_WEBHOOK_SECRET"] = SECRET

from main import app, verify_jfrog_request  # noqa: E402

client = TestClient(app)

# Shapes taken from JFrog's webhook event types documentation
PAYLOADS = {
    "artifact.deployed": {
        "domain": "artifact",
        "event_type": "deployed",
        "data": {"repo_key": "sample_repo", "path": "sample_dir/sample.txt", "name": "sample.txt", "sha256": "abc", "size": 0},
    },
    "artifact.deleted": {
        "domain": "artifact",
        "event_type": "deleted",
        "data": {"repo_key": "sample_repo", "path": "sample_dir/sample.txt", "name": "sample.txt", "sha256": "abc", "size": 0},
    },
    "artifact.moved": {
        "domain": "artifact",
        "event_type": "moved",
        "data": {"repo_key": "sample_repo", "path": "a.txt", "source_repo_path": "sample_repo", "target_repo_path": "sample_target_repo"},
    },
    "docker.pushed": {
        "domain": "docker",
        "event_type": "pushed",
        "data": {"repo_key": "docker-dev", "image_name": "sample-image", "tag": "1.0.0", "image_type": "oci"},
    },
    "build.uploaded": {
        "domain": "build",
        "event_type": "uploaded",
        "data": {"build_name": "sample_build_name", "build_number": "1", "build_repo": "artifactory-build-info"},
    },
    "build.promoted": {
        "domain": "build",
        "event_type": "promoted",
        "data": {"build_name": "sample_build_name", "build_number": "1", "build_repo": "artifactory-build-info"},
    },
}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PAYLOADS["artifact.deployed"])
    return client.post(
        "/webhooks/jfrog",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestEventAuthHeader:
    def test_correct_token(self):
        res = post({"X-JFrog-Event-Auth": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-jfrog-event-auth": SECRET}).status_code == 200

    def test_missing_header(self):
        assert post().status_code == 401

    def test_wrong_token_same_length(self):
        assert post({"X-JFrog-Event-Auth": "x" * len(SECRET)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"X-JFrog-Event-Auth": "short"}).status_code == 401

    def test_secret_in_another_header(self):
        assert post({"Authorization": f"Bearer {SECRET}"}).status_code == 401

    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401


@pytest.mark.parametrize(
    "content_type",
    ["application/json", "text/plain", "application/vnd.api+json", "application/octet-stream"],
)
def test_any_content_type(content_type):
    res = post({"X-JFrog-Event-Auth": SECRET}, json.dumps(PAYLOADS["docker.pushed"]), content_type)
    assert res.status_code == 200


class TestEvents:
    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_handles_event(self, name, capsys):
        res = post({"X-JFrog-Event-Auth": SECRET}, json.dumps(PAYLOADS[name]))
        assert res.status_code == 200
        assert "Unhandled event" not in capsys.readouterr().out

    def test_acknowledges_unhandled_event(self, capsys):
        body = json.dumps({"domain": "user", "event_type": "locked", "data": {}})
        res = post({"X-JFrog-Event-Auth": SECRET}, body)
        assert res.status_code == 200
        assert "Unhandled event: user locked" in capsys.readouterr().out


class TestBodyValidation:
    def test_invalid_json(self):
        assert post({"X-JFrog-Event-Auth": SECRET}, "not json").status_code == 400

    def test_non_object_body(self):
        assert post({"X-JFrog-Event-Auth": SECRET}, "[1, 2]").status_code == 400


class TestVerifyHelper:
    def test_no_secret_configured(self):
        assert verify_jfrog_request({"x-jfrog-event-auth": "anything"}, "") is False

    def test_matching_token(self):
        assert verify_jfrog_request({"x-jfrog-event-auth": SECRET}, SECRET) is True


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
