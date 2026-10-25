import json
import os

# Set test environment variables before importing the app
os.environ["VIDEOASK_WEBHOOK_HEADER"] = "secret"
os.environ["VIDEOASK_WEBHOOK_SECRET"] = "Bearer test_videoask_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, safe_equal, verify_videoask_request

client = TestClient(app)

SECRET = os.environ["VIDEOASK_WEBHOOK_SECRET"]

EVENTS = [
    "form_response",
    "form_response_transcribed",
    "form_author_message",
    "form_contact_message",
    "form_contact_tagged",
    "form_contact_untagged",
]


def sample_payload(event_type="form_response"):
    return {
        "event_id": "7df19833701662b6414ed1765dcc626c",
        "event_type": event_type,
        "interaction_id": "386bbc0b-bb60-4b62-82fa-d630d0d2b83b",
        "contact": {
            "contact_id": "7c6550ff-fe15-424a-918e-2c1936db8aed",
            "name": "John Doe",
            "email": "john.doe@example.com",
            "answers": [],
        },
        "form": {"form_id": "5a1b8066-f92c-47bf-b8f2-3beb0a738122", "title": "Example form"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/videoask",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_value(self):
        res = post({"secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"SECRET": SECRET}).status_code == 200

    def test_whole_value_is_compared_including_bearer_prefix(self):
        assert post({"secret": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"secret": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"secret": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header_name(self):
        assert post({"x-other": SECRET}).status_code == 401

    def test_custom_header_name(self):
        assert verify_videoask_request({"x-videoask-key": "abc"}, header_name="X-VideoAsk-Key", secret="abc") is True
        assert verify_videoask_request({"x-videoask-key": "abd"}, header_name="X-VideoAsk-Key", secret="abc") is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_videoask_request({"secret": SECRET}, secret="") is False
        assert verify_videoask_request({"secret": SECRET}, secret=SECRET) is True

    def test_non_ascii_values_do_not_raise(self):
        assert safe_equal("pässwörd", "pässwörd") is True
        assert safe_equal("pässwörd", "password") is False


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"secret": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"secret": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"secret": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"secret": SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
