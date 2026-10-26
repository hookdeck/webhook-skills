import json
import os

# Set test environment variables before importing the app
os.environ["OPSGENIE_WEBHOOK_HEADER"] = "X-Opsgenie-Secret"
os.environ["OPSGENIE_WEBHOOK_SECRET"] = "test_opsgenie_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_opsgenie_request

client = TestClient(app)

HEADER = os.environ["OPSGENIE_WEBHOOK_HEADER"]
SECRET = os.environ["OPSGENIE_WEBHOOK_SECRET"]

ACTIONS = [
    "Create", "Acknowledge", "UnAcknowledge", "AddNote", "AddTags", "RemoveTags", "Close",
    "AssignOwnership", "TakeOwnership", "Delete", "Escalate", "UpdatePriority",
    "UpdateDescription", "UpdateMessage", "AddTeam", "AddRecipient",
]


def sample_payload(action="Create"):
    return {
        "source": {"name": "web", "type": "API"},
        "alert": {
            "alertId": "052652ac-5d1c-464a-812a-7dd18bbfba8c",
            "message": "test alert",
            "alias": "aliastest",
            "tinyId": "23",
            "tags": ["tag1", "tag2"],
            "username": "fili@ifountain.com",
            "entity": "",
        },
        "action": action,
        "integrationId": "37c8f316-17c6-49d7-899b-9c7e540c048d",
        "integrationName": "Integration1",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/opsgenie",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderVerification:
    def test_correct_secret(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.upper(): SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_a_different_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        headers = {HEADER.lower(): SECRET}
        assert verify_opsgenie_request(headers, HEADER, secret="") is False
        assert verify_opsgenie_request(headers, HEADER, secret=SECRET) is True

    def test_non_ascii_values_do_not_raise(self):
        headers = {HEADER.lower(): "sécret-ü"}
        assert verify_opsgenie_request(headers, HEADER, secret="sécret-ü") is True
        assert verify_opsgenie_request(headers, HEADER, secret="secret-u") is False


class TestDefaultAuthorizationHeader:
    BEARER = f"Bearer {SECRET}"

    def test_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("OPSGENIE_WEBHOOK_HEADER")
        assert verify_opsgenie_request({"authorization": SECRET}, secret=SECRET) is True

    def test_whole_value_with_bearer_prefix(self):
        headers = {"authorization": self.BEARER}
        assert verify_opsgenie_request(headers, "Authorization", secret=self.BEARER) is True

    def test_bearer_prefix_is_not_stripped(self):
        assert verify_opsgenie_request({"authorization": self.BEARER}, "Authorization", secret=SECRET) is False
        assert verify_opsgenie_request({"authorization": SECRET}, "Authorization", secret=self.BEARER) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401


class TestActionHandling:
    @pytest.mark.parametrize("action", ACTIONS)
    def test_handles_action(self, action, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(action)))
        assert res.status_code == 200
        assert "Custom or unhandled" not in capsys.readouterr().out

    def test_escalate_without_source_object(self):
        body = {
            "action": "Escalate",
            "alert": {"alertId": "7ba97e3a-d328-4b5e-8f9a-39e945a3869a"},
            "escalationName": "test_esc",
            "escalationNotify": {"name": "test@ifountain.com", "type": "default", "entity": "user"},
        }
        assert post({HEADER: SECRET}, body=json.dumps(body)).status_code == 200

    def test_custom_action_is_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("TestAction")))
        assert res.status_code == 200
        assert "TestAction" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
