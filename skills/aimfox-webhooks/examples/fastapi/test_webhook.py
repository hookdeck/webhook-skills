import json
import os

# Set test environment variables before importing the app
os.environ["AIMFOX_WEBHOOK_HEADER"] = "Authorization"
os.environ["AIMFOX_WEBHOOK_SECRET"] = "Bearer test_aimfox_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_aimfox_request

client = TestClient(app)

SECRET = os.environ["AIMFOX_WEBHOOK_SECRET"]

EVENTS = [
    "account_logged_in", "account_logged_out", "new_connection", "view", "connect", "accepted",
    "inmail", "message", "new_reply", "reply", "inmail_reply", "lead_label_added",
    "campaign_created", "campaign_started", "campaign_ended", "inbox_event", "campaign_reply",
]


def sample_payload(event_type="new_connection"):
    return {
        "id": "b82dce4c-34ef-4d08-875b-bf53a7432661",
        "event_type": event_type,
        "event": {"timestamp": "2024-11-24T21:08:27.966Z"},
        "workspace": {"id": "47973863-0513-4ee6-910a-c5bc55782ed2", "name": "Aimfox Workspace"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/aimfox",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthenticationHeader:
    def test_correct_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_credential_in_other_header_is_rejected(self):
        assert post({"X-Aimfox-Secret": SECRET}).status_code == 401

    def test_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("AIMFOX_WEBHOOK_HEADER", "X-Aimfox-Secret")
        assert verify_aimfox_request({"x-aimfox-secret": SECRET}) is True
        assert verify_aimfox_request({"authorization": SECRET}) is False

    def test_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("AIMFOX_WEBHOOK_HEADER")
        assert verify_aimfox_request({"authorization": SECRET}) is True

    def test_whole_basic_value(self):
        basic = "Basic dXNlcjpwYXNz"
        assert verify_aimfox_request({"authorization": basic}, secret=basic) is True
        assert verify_aimfox_request({"authorization": "dXNlcjpwYXNz"}, secret=basic) is False

    def test_non_ascii_value_does_not_raise(self):
        assert verify_aimfox_request({"authorization": "Bearer pässword"}, secret=SECRET) is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_aimfox_request({"authorization": SECRET}, secret="") is False
        assert verify_aimfox_request({"authorization": SECRET}, secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
