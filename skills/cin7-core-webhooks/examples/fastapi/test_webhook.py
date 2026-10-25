import json
import os

# Set test environment variables before importing the app
os.environ["CIN7_CORE_WEBHOOK_HEADER"] = "X-Cin7-Token"
os.environ["CIN7_CORE_WEBHOOK_SECRET"] = "Bearer test_cin7_token_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_cin7_core_request

client = TestClient(app)

HEADER = os.environ["CIN7_CORE_WEBHOOK_HEADER"]
SECRET = os.environ["CIN7_CORE_WEBHOOK_SECRET"]

EVENTS = [
    "Sale/Created", "Sale/OrderAuthorised", "Sale/ShipmentAuthorised",
    "Purchase/OrderAuthorised", "Product/Updated",
]


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps({"EventType": "Sale/Created"})
    return client.post(
        "/webhooks/cin7-core",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_exact_whole_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_credential_in_other_header_is_ignored(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_cin7_core_request(Headers(raw=[(HEADER.lower().encode(), "Bearer tökén".encode("utf-8"))]), HEADER, SECRET) is False

    def test_defaults_to_authorization_header(self):
        os.environ.pop("CIN7_CORE_WEBHOOK_HEADER")
        try:
            assert verify_cin7_core_request(Headers({"authorization": "Bearer t"}), None, "Bearer t") is True
        finally:
            os.environ["CIN7_CORE_WEBHOOK_HEADER"] = HEADER

    def test_unset_secret_rejects_everything(self):
        assert verify_cin7_core_request({HEADER: SECRET}, HEADER, "") is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({HEADER: SECRET}, body=json.dumps({"EventType": event_type}))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self):
        res = post({HEADER: SECRET}, body=json.dumps({"EventType": "Something/New"}))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
