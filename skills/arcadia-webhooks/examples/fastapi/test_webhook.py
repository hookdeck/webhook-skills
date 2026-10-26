import json
import os

# Set test environment variables before importing the app
os.environ["ARCADIA_WEBHOOK_HEADER"] = "X-Arcadia-Token"
os.environ["ARCADIA_WEBHOOK_SECRET"] = "test_arcadia_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_arcadia_request

client = TestClient(app)

HEADER = os.environ["ARCADIA_WEBHOOK_HEADER"]
SECRET = os.environ["ARCADIA_WEBHOOK_SECRET"]

# Compact versions of the documented sample payloads: (eventType, resource, data)
CREDENTIAL = {"id": "crd_0c5d396f-f11c-c76b-9be8-89343463af21", "connectionHealth": "CONNECTION_SUCCESS", "isCustomerActionRequired": False}
METER = {"id": "mtr_1", "accounts": [{"id": "act_831b8c55-77b6-3341-c922-aa371ad3c2a9", "accountNumber": "9207895340384735758"}]}
EVENTS = [
    ("STATUS_CHANGE", "CREDENTIAL", CREDENTIAL),
    ("NEW_DATA_AVAILABLE", "METER", METER),
    ("EXISTING_DATA_UPDATED", "METER", METER),
    ("DATA_DELETED", "BUSINESS_UNIT_DELETION", {"businessUnitId": "bus_69dc6270-0dbe-cd39-cadf-40f83ecfd416", "movedToBusinessUnitId": "bus_fb71b140-b933-9c35-4a40-3aca987b6583", "totalAccountsMoved": 4}),
    ("BUSINESS_UNIT_ASSIGNMENT", "ROOT_BUSINESS_UNIT_ACCOUNT", {"account": {"id": "act_02e0642e-e303-f82e-fd8a-47c5dc3bcab3"}}),
    ("REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS", "CREDENTIAL", CREDENTIAL),
    ("REAL_TIME_CREDENTIAL_VALIDATION_FAILURE", "CREDENTIAL", {**CREDENTIAL, "connectionHealth": "CONNECTION_FAILURE", "isCustomerActionRequired": True}),
    ("MFA_CHALLENGE_METHOD", "MFA_METHOD_PROMPT", {"credential": CREDENTIAL, "verificationMethods": ["sms", "email"]}),
    ("MFA_CHALLENGE_CODE", "MFA_CODE_PROMPT", {"credential": CREDENTIAL, "isResubmission": False}),
]

_counter = 0


def sample_payload(event_type="STATUS_CHANGE", resource="CREDENTIAL", data=None):
    global _counter
    _counter += 1
    return {
        "id": f"whk_00000000-0000-0000-0000-{_counter:012d}",
        "eventType": event_type,
        "resource": resource,
        "createdAt": "2024-02-21T00:00:00.000+00:00",
        "businessUnitIds": ["bus_5ab42908-c08f-260c-466c-49a3904a86eb"],
        "errors": [],
        "data": CREDENTIAL if data is None else data,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/arcadia",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-arcadia-token": SECRET}).status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_does_not_accept_authorization_header(self):
        assert post({"Authorization": f"Bearer {SECRET}"}).status_code == 401

    def test_compares_whole_value_without_bearer_parsing(self):
        env = {"ARCADIA_WEBHOOK_HEADER": "X-Arcadia-Token", "ARCADIA_WEBHOOK_SECRET": "Bearer_abc"}
        assert verify_arcadia_request(Headers({"x-arcadia-token": "Bearer_abc"}), env) is True
        assert verify_arcadia_request(Headers({"x-arcadia-token": "abc"}), env) is False

    def test_custom_header_name(self):
        env = {"ARCADIA_WEBHOOK_HEADER": "X-Utility-Key", "ARCADIA_WEBHOOK_SECRET": SECRET}
        assert verify_arcadia_request(Headers({"x-utility-key": SECRET}), env) is True
        assert verify_arcadia_request(Headers({"x-arcadia-token": SECRET}), env) is False

    def test_default_header_name(self):
        assert verify_arcadia_request(Headers({"x-arcadia-token": SECRET}), {"ARCADIA_WEBHOOK_SECRET": SECRET}) is True

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str would raise TypeError for non-ASCII; bytes must not.
        env = {"ARCADIA_WEBHOOK_SECRET": SECRET}
        assert verify_arcadia_request(Headers({"x-arcadia-token": "café"}), env) is False
        assert verify_arcadia_request(Headers({"x-arcadia-token": SECRET}), {"ARCADIA_WEBHOOK_SECRET": "café"}) is False

    def test_rejects_everything_when_secret_unset(self):
        assert verify_arcadia_request(Headers({"x-arcadia-token": SECRET}), {}) is False
        assert verify_arcadia_request(Headers({"x-arcadia-token": ""}), {"ARCADIA_WEBHOOK_SECRET": ""}) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type,resource,data", EVENTS)
    def test_handles_event(self, event_type, resource, data, capsys):
        body = json.dumps(sample_payload(event_type, resource, data))
        res = post({HEADER: SECRET}, body=body)
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self, capsys):
        body = json.dumps(sample_payload("SOMETHING_NEW", "THING", {}))
        res = post({HEADER: SECRET}, body=body)
        assert res.status_code == 200
        assert "Unhandled eventType: SOMETHING_NEW" in capsys.readouterr().out

    def test_deduplicates_on_payload_id(self, capsys):
        body = json.dumps(sample_payload("NEW_DATA_AVAILABLE", "METER", METER))
        first = post({HEADER: SECRET}, body=body)
        second = post({HEADER: SECRET}, body=body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("New data available") == 1


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
