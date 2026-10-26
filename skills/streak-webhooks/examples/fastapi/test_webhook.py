import json
import os

# Set test environment variables before importing the app
os.environ["STREAK_WEBHOOK_TOKEN"] = "test_streak_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_streak_request

client = TestClient(app)

TOKEN = os.environ["STREAK_WEBHOOK_TOKEN"]

EVENTS = [
    "BOX_CREATE", "BOX_DELETE", "STAGE_CREATE", "BOX_NEW_EMAIL_ADDRESS", "BOX_EDIT",
    "BOX_CHANGE_STAGE", "BOX_CHANGE_PIPELINE", "COMMENT_CREATE", "MEETING_CREATE",
    "MEETING_UPDATE", "TASK_CREATE", "TASK_COMPLETE", "TASK_DUE", "TASK_UPDATED",
    "CONTACT_CREATE", "ORG_CREATE", "CONTACT_UPDATE", "ORG_UPDATE", "CONTACT_DELETE",
    "ORG_DELETE",
]


def sample_payload():
    return [
        {"key": "gICIxYzv9QoM", "pipelineKey": "agxzfm1hZaXCgw", "name": "Acme deal", "creationDate": 1507226274178}
    ]


def post(headers=None, body=None, event="BOX_CREATE", content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    url = "/webhooks/streak" + (f"?event={event}" if event else "")
    return client.post(url, content=content, headers={"Content-Type": content_type, **(headers or {})})


AUTH = {"X-Streak-Webhook-Token": TOKEN}


class TestTokenVerification:
    def test_correct_token(self):
        res = post(AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-streak-webhook-token": TOKEN}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({"X-Streak-Webhook-Token": "x" * len(TOKEN)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"X-Streak-Webhook-Token": "short"}).status_code == 401

    def test_whole_value_must_match(self):
        assert post({"X-Streak-Webhook-Token": TOKEN + "-extra"}).status_code == 401

    def test_non_ascii_token_does_not_raise(self):
        # A non-ASCII header value (latin-1 on the wire) must give 401, not an exception.
        assert post({"X-Streak-Webhook-Token": "tökén".encode("latin-1")}).status_code == 401
        assert verify_streak_request({"x-streak-webhook-token": "tökén"}, "tökén") is True

    def test_missing_token(self):
        assert post().status_code == 401

    def test_authorization_bearer_not_accepted(self):
        assert post({"Authorization": f"Bearer {TOKEN}"}).status_code == 401

    def test_unconfigured_token_rejects_everything(self):
        assert verify_streak_request({"x-streak-webhook-token": TOKEN}, "") is False

    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401


class TestBodyHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_events(self, event):
        assert post(AUTH, event=event).status_code == 200

    def test_no_event_param(self):
        assert post(AUTH, event=None).status_code == 200

    def test_single_object(self):
        assert post(AUTH, body=json.dumps(sample_payload()[0]), event="BOX_EDIT").status_code == 200

    def test_any_content_type(self):
        assert post(AUTH, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post(AUTH, body="not json").status_code == 400

    def test_non_object_body(self):
        assert post(AUTH, body='"hello"').status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
