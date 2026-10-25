import json
import os

# Set test environment variables before importing the app
os.environ["PINGONE_WEBHOOK_SECRET"] = "Bearer test_pingone_header_value_0123456789"
os.environ["PINGONE_WEBHOOK_HEADER"] = "Authorization"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_events, verify_pingone_request

client = TestClient(app)

SECRET = os.environ["PINGONE_WEBHOOK_SECRET"]


def sample_event(event_type="USER.CREATED", event_id="evt-1"):
    """Shape of a PingOne ACTIVITY audit event."""
    return {
        "id": event_id,
        "createdAt": "2026-10-25T10:00:00.000Z",
        "action": {"type": event_type, "description": event_type},
        "actors": {"user": {"id": "u-1", "name": "jane"}},
        "resources": [{"id": "r-1", "type": "USER"}],
    }


def json_array(*types):
    return json.dumps([sample_event(t, f"evt-{i}") for i, t in enumerate(types)])


def ndjson(*types):
    return "\n".join(json.dumps(sample_event(t, f"evt-{i}")) for i, t in enumerate(types)) + "\n"


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json_array("USER.CREATED")
    return client.post(
        "/webhooks/pingone",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialCheck:
    def test_exact_header_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": 1}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_whole_value_compared_bare_token_rejected(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_authenticates_before_parsing(self):
        assert post(body="{not json").status_code == 401


class TestBodyFormats:
    def test_json_array_batch(self):
        res = post({"Authorization": SECRET}, json_array("USER.CREATED", "USER.UPDATED", "AUTHENTICATION.CREATED"))
        assert res.status_code == 200
        assert res.json() == {"received": 3}

    def test_nd_json(self):
        res = post({"Authorization": SECRET}, ndjson("USER.CREATED", "USER.UPDATED"), "application/x-ndjson")
        assert res.status_code == 200
        assert res.json() == {"received": 2}

    def test_any_content_type(self):
        assert post({"Authorization": SECRET}, content_type="text/plain").status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        ["USER.CREATED", "USER.UPDATED", "USER.DELETED", "AUTHENTICATION.CREATED", "PASSWORD.RESET", "SOMETHING.ELSE"],
    )
    def test_handles_events(self, event_type):
        assert post({"Authorization": SECRET}, json_array(event_type)).status_code == 200

    def test_invalid_body(self):
        assert post({"Authorization": SECRET}, "{not json").status_code == 400

    def test_empty_body(self):
        assert post({"Authorization": SECRET}, "").status_code == 400

    def test_non_object_items(self):
        assert post({"Authorization": SECRET}, "[1,2,3]").status_code == 400


class TestVerifyPingOneRequest:
    def test_rejects_when_nothing_configured(self):
        assert verify_pingone_request({"authorization": ""}, {}) is False
        assert verify_pingone_request({"authorization": "anything"}, {}) is False

    def test_custom_header_name(self):
        config = {"PINGONE_WEBHOOK_SECRET": "s3cret", "PINGONE_WEBHOOK_HEADER": "X-PingOne-Token"}
        assert verify_pingone_request({"x-pingone-token": "s3cret"}, config) is True
        assert verify_pingone_request({"authorization": "s3cret"}, config) is False

    def test_basic_value_is_not_parsed(self):
        config = {"PINGONE_WEBHOOK_SECRET": "Basic username:password"}
        assert verify_pingone_request({"authorization": "Basic username:password"}, config) is True
        assert verify_pingone_request({"authorization": "Basic dXNlcm5hbWU6cGFzc3dvcmQ="}, config) is False

    def test_non_ascii_does_not_raise(self):
        config = {"PINGONE_WEBHOOK_SECRET": "pässwörd"}
        assert verify_pingone_request({"authorization": "pässwörd"}, config) is True
        assert verify_pingone_request({"authorization": "passwörd"}, config) is False


class TestParseEvents:
    def test_pretty_printed_array(self):
        assert len(parse_events(json.dumps([sample_event()], indent=2).encode())) == 1


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
