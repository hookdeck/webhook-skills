import json
import os

# Set test environment variables before importing the app
os.environ["ONELOGIN_WEBHOOK_HEADER"] = "X-Onelogin-Secret"
os.environ["ONELOGIN_WEBHOOK_SECRET"] = "Bearer test_onelogin_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_events, verify_onelogin_request

client = TestClient(app)

HEADER = os.environ["ONELOGIN_WEBHOOK_HEADER"]
SECRET = os.environ["ONELOGIN_WEBHOOK_SECRET"]

EVENT_TYPE_IDS = [5, 6, 7, 8, 11, 22]


def sample_event(event_type_id=5):
    return {
        "event_type_id": event_type_id,
        "account_id": 92920,
        "user_id": 32916209,
        "user_name": "John Richards",
        "ipaddr": "125.236.219.21",
        "app_name": None,
        "risk_score": None,
        "uuid": "d210df80-ede8-42ba-8199-00ce951bc222",
        "event_timestamp": "2017-12-05 19:13:06 UTC",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps([sample_event()])
    return client.post(
        "/webhooks/onelogin",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderAuthentication:
    def test_accepts_exact_header_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": 1}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_compares_whole_value_without_stripping_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_under_a_different_header_name(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_onelogin_request({HEADER: "pässwörd"}, SECRET, HEADER) is False

    def test_rejects_everything_when_secret_unset(self):
        headers = {HEADER: SECRET}
        assert verify_onelogin_request(headers, "", HEADER) is False
        assert verify_onelogin_request(headers, SECRET, HEADER) is True

    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("ONELOGIN_WEBHOOK_HEADER")
        assert verify_onelogin_request({"Authorization": SECRET}) is True


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_iterates_every_event(self, capsys):
        body = json.dumps([sample_event(5), sample_event(6), sample_event(7)])
        res = post({HEADER: SECRET}, body)
        assert res.status_code == 200
        assert res.json() == {"received": 3}
        assert len(capsys.readouterr().out.strip().splitlines()) == 3

    def test_newline_delimited_events_return_400(self):
        # Only the JSON Array format type is documented.
        body = "\n".join(json.dumps(e) for e in [sample_event(5), sample_event(6)])
        res = post({HEADER: SECRET}, body, "text/plain")
        assert res.status_code == 400

    def test_invalid_json_returns_400_after_auth(self):
        assert post({HEADER: SECRET}, "{not json").status_code == 400

    def test_array_of_non_objects_returns_400(self):
        assert post({HEADER: SECRET}, "[1,2]").status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert post(None, "{not json").status_code == 401

    def test_parse_events(self):
        assert parse_events(b'[{"a":1}]') == [{"a": 1}]
        assert parse_events(b'{"a":1}') == [{"a": 1}]
        assert parse_events(b"") is None
        assert parse_events(b"nope") is None
        assert parse_events(b"\xff\xfe") is None


class TestEventHandling:
    @pytest.mark.parametrize("event_type_id", EVENT_TYPE_IDS)
    def test_handles_event_type(self, event_type_id, capsys):
        res = post({HEADER: SECRET}, json.dumps([sample_event(event_type_id)]))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event_types(self, capsys):
        res = post({HEADER: SECRET}, json.dumps([sample_event(999)]))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
