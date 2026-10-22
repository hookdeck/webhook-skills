import json
import os

# Set test environment variables before importing the app
os.environ["PARAGON_WEBHOOK_SECRET"] = "Bearer test_paragon_secret_0123456789"
os.environ["PARAGON_WEBHOOK_HEADER"] = "Authorization"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_paragon_request

client = TestClient(app)

SECRET = os.environ["PARAGON_WEBHOOK_SECRET"]

EVENTS = ["workflow_failure", "credentials_failure"]


def sample_payload(event_type="workflow_failure"):
    return {
        "type": event_type,
        "timestamp": 1729629642607,
        "timestampISO": "2024-10-22T20:40:42.607Z",
        "message": "Workflow “Test Workflow Name“ failed for User user_1",
        "user": {"id": "user_1", "metadata": {}},
        "project": {"id": "613b038f-e9bf-49ec-bc58-ba8d620754c7", "name": "Test Project Name"},
        "integration": {"id": "57a96b31-c69e-421a-bb32-7a25f9c6a893", "type": "slack"},
        "data": {"type": event_type, "error": "Test error message"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/paragon",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_accepts_exact_header_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_does_not_strip_bearer_prefix(self):
        assert post({"Authorization": SECRET.removeprefix("Bearer ")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; we encode to bytes first (header sent as raw UTF-8 bytes).
        res = client.post(
            "/webhooks/paragon",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", "Authorization": "caf\u00e9".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        headers = {"authorization": SECRET}
        assert verify_paragon_request(headers, secret="") is False
        assert verify_paragon_request(headers, secret=SECRET) is True

    def test_custom_header_name(self):
        headers = {"x-paragon-secret": "abc123"}
        assert verify_paragon_request(headers, secret="abc123", header_name="X-Paragon-Secret") is True
        assert verify_paragon_request(headers, secret="abc123", header_name="Authorization") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json_is_400(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200
