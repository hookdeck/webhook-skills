import json
import os

# Set test environment variables before importing the app
os.environ["AXIOM_WEBHOOK_HEADER"] = "X-Axiom-Token"
os.environ["AXIOM_WEBHOOK_SECRET"] = "Bearer test_axiom_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_axiom_request

client = TestClient(app)

NAME = os.environ["AXIOM_WEBHOOK_HEADER"]
SECRET = os.environ["AXIOM_WEBHOOK_SECRET"]


def sample_payload(action="Open"):
    """Illustrative payload rendered from Axiom's default Custom webhook template."""
    return {
        "action": action,
        "event": {
            "monitorID": "CabI3w142069etTgd0",
            "body": "Current value of 57347 is above or equal to the threshold value of 0",
            "description": "",
            "queryEndTime": "2024-06-28 14:55:57.631364493 +0000 UTC",
            "queryStartTime": "2024-06-28 14:45:57.631364493 +0000 UTC",
            "timestamp": "2024-06-28 14:55:57 +0000 UTC",
            "title": "Axiom Monitor Test",
            "value": 57347,
            "matchedEvent": None,
            "groupKeys": None,
            "groupValues": None,
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/axiom",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_value(self):
        res = post({NAME: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({NAME.lower(): SECRET}).status_code == 200

    def test_whole_value_including_bearer_prefix(self):
        assert post({NAME: SECRET.removeprefix("Bearer ")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({NAME: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({NAME: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header_name_is_ignored(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_is_rejected_not_a_500(self):
        res = client.post(
            "/webhooks/axiom",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", NAME: "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        headers = Headers({NAME.lower(): SECRET})
        assert verify_axiom_request(headers, name=NAME, secret="") is False
        assert verify_axiom_request(headers, name=NAME, secret=SECRET) is True

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("AXIOM_WEBHOOK_HEADER")
        assert verify_axiom_request(Headers({"authorization": SECRET})) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({NAME: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({NAME: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({NAME: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestNotificationHandling:
    @pytest.mark.parametrize("action", ["Open", "Closed"])
    def test_handles_action(self, action, capsys):
        res = post({NAME: SECRET}, body=json.dumps(sample_payload(action)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_action_is_acknowledged(self):
        res = post({NAME: SECRET}, body=json.dumps(sample_payload("Paused")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
