import json
import os

# Set test environment variables before importing the app
os.environ["CLICKATELL_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["CLICKATELL_WEBHOOK_SECRET"] = "Bearer test_clickatell_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_clickatell_request

client = TestClient(app)

HEADER = os.environ["CLICKATELL_WEBHOOK_HEADER"]
SECRET = os.environ["CLICKATELL_WEBHOOK_SECRET"]

EVENTS = [
    "messageStatusUpdate", "messageFallback", "statusIsTyping", "moText", "moMedia",
    "moLocation", "moContacts", "moSuggestedResponse", "moListPickerResponse", "moButtonResponse",
]


def sample_payload(kind="messageStatusUpdate"):
    return {
        "integrationId": "fa8090815f05d5ed015f0b5b56080cd2",
        "integrationName": "My integration",
        "event": {
            kind: [{
                "channel": "whatsapp",
                "timestamp": 1506607698860,
                "statusCode": 5,
                "status": "DEVICE_ACK",
                "messageId": "3a89680503414383af44dcd0e4e5f184",
                "from": "2799900001",
                "content": "hello",
            }]
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/clickatell",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_name_is_rejected(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("CLICKATELL_WEBHOOK_HEADER")
        headers = {"authorization": "Bearer abc"}
        assert verify_clickatell_request(headers, expected="Bearer abc") is True

    def test_non_ascii_value_does_not_raise(self):
        assert verify_clickatell_request({"x-webhook-secret": "café"}, expected="café!") is False
        assert verify_clickatell_request({"x-webhook-secret": "café"}, expected="café") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_clickatell_request({"x-webhook-secret": SECRET}, expected="") is False
        assert verify_clickatell_request({"x-webhook-secret": SECRET}, expected=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_missing_event_object(self):
        assert post({HEADER: SECRET}, body='{"integrationId":"abc"}').status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("kind", EVENTS)
    def test_handles_event(self, kind, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(kind)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_kind_is_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("somethingNew")))
        assert res.status_code == 200
        assert "Unhandled event: somethingNew" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
