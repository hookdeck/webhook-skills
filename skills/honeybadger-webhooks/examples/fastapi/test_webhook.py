import json
import os

# Set test environment variables before importing the app
os.environ["HONEYBADGER_TOKEN"] = "test_honeybadger_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_honeybadger_request

client = TestClient(app)

TOKEN = os.environ["HONEYBADGER_TOKEN"]

EVENTS = [
    "occurred", "resolved", "unresolved", "assigned", "commented", "rate_exceeded",
    "volume_spike", "deployed", "down", "up", "cert_will_expire", "check_in_missing",
    "check_in_reporting",
]


def sample_payload(event="occurred"):
    return {
        "event": event,
        "message": "[Crywolf/test] RuntimeError - oops",
        "fault": {"id": 3151009, "project_id": 1717, "klass": "RuntimeError", "environment": "development"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/honeybadger",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestTokenVerification:
    def test_correct_token(self):
        res = post({"Honeybadger-Token": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"honeybadger-token": TOKEN}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({"Honeybadger-Token": "x" * len(TOKEN)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"Honeybadger-Token": "short"}).status_code == 401

    def test_missing_token(self):
        assert post().status_code == 401

    def test_bearer_authorization_is_not_accepted(self):
        assert post({"Authorization": f"Bearer {TOKEN}"}).status_code == 401

    def test_unconfigured_token_rejects_everything(self):
        assert verify_honeybadger_request({"honeybadger-token": TOKEN}, token="") is False
        assert verify_honeybadger_request({"honeybadger-token": TOKEN}, token=TOKEN) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Honeybadger-Token": TOKEN}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Honeybadger-Token": TOKEN}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Honeybadger-Token": TOKEN}, body="[1,2]").status_code == 400

    def test_invalid_json_without_token_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"Honeybadger-Token": TOKEN}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"Honeybadger-Token": TOKEN}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
