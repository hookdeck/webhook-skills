import json
import os

# Set test environment variables before importing the app
CREDENTIAL = "Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516"
os.environ["NAVATTIC_AUTHORIZATION"] = CREDENTIAL

import pytest
from fastapi.testclient import TestClient

from main import app, classify_data, verify_navattic_request

client = TestClient(app)

# Shapes taken from Navattic's documented session_closed examples (trimmed)
COMPANY_ACCOUNT = {
    "id": "clx8f4iii0011abcd12345678",
    "createdAt": "2026-06-01T09:14:00.000Z",
    "updatedAt": "2026-07-14T18:32:05.000Z",
    "workspaceId": "clx8ezzzz0000abcd12345678",
    "name": "Example Corp",
    "websiteDomain": "example.com",
    "engaged": True,
    "employeeCount": 250,
    "customPropertyValues": [],
}
VISITOR = {
    "eventType": "session_closed",
    "timestamp": "2026-07-14T18:32:05.000Z",
    "data": {
        "session": {
            "type": "INTERACTIVE_DEMO",
            "recordedGuideSessionId": "clx8f2k1a0003abcd12345678",
            "createdAt": "2026-07-14T18:20:11.000Z",
            "closedAt": "2026-07-14T18:32:05.000Z",
            "mostRecentDemoName": "Acme Product Tour",
            "recordedEvents": [{"id": "clx8f3xyz0004abcd12345678", "type": "VIEW_STEP", "recordedStepName": "Welcome"}],
        },
        "endUser": {"id": "clx8f1hhh0010abcd12345678", "mostRecentEmail": "jane.doe@example.com", "mostRecentName": "Jane Doe"},
        "companyAccount": COMPANY_ACCOUNT,
    },
}
ACCOUNT = {
    "eventType": "session_closed",
    "timestamp": "2026-07-14T18:32:05.000Z",
    "data": COMPANY_ACCOUNT,
}

AUTH = {"Authorization": CREDENTIAL}


def send(method="POST", body=None, headers=None, content_type="application/json"):
    kwargs = {"headers": {**(headers or {})}}
    if body is not None or method != "GET":
        kwargs["content"] = body if body is not None else json.dumps(VISITOR)
        kwargs["headers"]["Content-Type"] = content_type
    return client.request(method, "/webhooks/navattic", **kwargs)


class TestNavatticWebhook:
    def test_accepts_full_authorization_header(self):
        res = send(headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_compares_basic_credential_as_whole_string(self, monkeypatch):
        import base64

        basic = "Basic " + base64.b64encode(b"user:pa:ss").decode()
        monkeypatch.setenv("NAVATTIC_AUTHORIZATION", basic)
        assert send(headers={"Authorization": basic}).status_code == 200
        assert send(headers=AUTH).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_wrong_credential(self):
        assert send(headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_rejects_token_without_prefix(self):
        assert send(headers={"Authorization": CREDENTIAL.replace("Bearer ", "")}).status_code == 401

    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
    def test_checks_credential_first_for_every_method(self, method):
        assert send(method).status_code == 401
        assert send(method, headers=AUTH).status_code == 200

    def test_accepts_authenticated_empty_body(self):
        res = send("GET", headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_authenticates_regardless_of_content_type(self):
        res = send(body=json.dumps(VISITOR), headers=AUTH, content_type="text/plain")
        assert res.status_code == 200

    def test_handles_account_events(self):
        assert send(body=json.dumps(ACCOUNT), headers=AUTH).status_code == 200

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps({**VISITOR, "eventType": "something_else"})
        assert send(body=body, headers=AUTH).status_code == 200

    def test_returns_400_for_invalid_json(self):
        assert send(body="not json", headers=AUTH).status_code == 400

    def test_returns_400_for_json_array(self):
        assert send(body="[1,2]", headers=AUTH).status_code == 400

    def test_classifies_visitor_and_account_data(self):
        assert classify_data(VISITOR["data"]) == "visitor"
        assert classify_data(ACCOUNT["data"]) == "account"
        assert classify_data({"foo": 1}) is None
        assert classify_data(None) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_navattic_request({"authorization": "Bearer x"}, {}) is False
        assert verify_navattic_request({"authorization": ""}, {"NAVATTIC_AUTHORIZATION": ""}) is False

    def test_non_ascii_header_does_not_raise(self):
        assert verify_navattic_request({"authorization": "Bearer é"}, {"NAVATTIC_AUTHORIZATION": CREDENTIAL}) is False
