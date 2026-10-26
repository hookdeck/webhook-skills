import json
import os

# Set test environment variables before importing the app
os.environ["PALMETTO_FINANCE_WEBHOOK_HEADER"] = "apiKey"
os.environ["PALMETTO_FINANCE_WEBHOOK_SECRET"] = "test_palmetto_server_api_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_palmetto_finance_request

client = TestClient(app)

SECRET = os.environ["PALMETTO_FINANCE_WEBHOOK_SECRET"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

EVENTS = [
    "accountCreated", "accountUpdated", "sendInvite", "applicationStatus", "contractApproved",
    "contractSending", "contractSent", "contractSigned", "contractVoided", "contractReinstated",
    "documentStatus", "documentUploaded", "milestonePackage", "milestoneAchieved",
    "milestoneStatusChanged", "quoteCreated", "quoteVoided", "requirementStatusChanged",
    "requirementCompleted", "termsAndConditionsAccepted", "allConsumerTaskEvents",
]


def sample_payload(event="accountCreated"):
    return {
        "event": event,
        "accountId": "palmetto-finance-account-id",
        "accountReference": "account-external-reference",
        "organizationId": "my-lightreach-alias",
        "programType": "solar",
    }


def send(headers=None, body=None, method="POST", content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    h = dict(headers or {})
    if content:
        h["Content-Type"] = content_type
    return client.request(method, "/webhooks/palmetto-finance", content=content, headers=h)


class TestApiKeyVerification:
    def test_accepts_correct_key(self):
        res = send({"apiKey": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send({"APIKEY": SECRET}).status_code == 200

    def test_rejects_wrong_key_of_same_length(self):
        assert send({"apiKey": "x" * len(SECRET)}).status_code == 401

    def test_rejects_key_of_different_length(self):
        assert send({"apiKey": "short"}).status_code == 401

    def test_rejects_missing_key(self):
        assert send().status_code == 401

    def test_rejects_key_in_different_header(self):
        assert send({"api_key": SECRET}).status_code == 401

    def test_does_not_strip_bearer_prefix(self):
        assert send({"apiKey": f"Bearer {SECRET}"}).status_code == 401

    def test_whole_value_with_bearer_prefix_in_secret(self):
        assert verify_palmetto_finance_request({"apiKey": "Bearer abc123"}, "Bearer abc123", "apiKey")
        assert not verify_palmetto_finance_request({"apiKey": "abc123"}, "Bearer abc123", "apiKey")

    def test_custom_header_name(self):
        assert verify_palmetto_finance_request({"api_key": SECRET}, SECRET, "api_key")
        assert not verify_palmetto_finance_request({"apiKey": SECRET}, SECRET, "api_key")

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert not verify_palmetto_finance_request({"apiKey": SECRET}, "")
        monkeypatch.delenv("PALMETTO_FINANCE_WEBHOOK_SECRET")
        assert not verify_palmetto_finance_request({"apiKey": SECRET})


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_key(self, method):
        assert send({"apiKey": SECRET}, method=method).status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_method_without_key(self, method):
        assert send(method=method).status_code == 401

    def test_acknowledges_empty_body(self):
        assert send({"apiKey": SECRET}, body="", method="GET").status_code == 200
        assert send({"apiKey": SECRET}, body="", method="DELETE").status_code == 200

    def test_checks_key_before_empty_body(self):
        assert send(body="", method="GET").status_code == 401


class TestBody:
    def test_accepts_any_content_type(self):
        res = send({"apiKey": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send({"apiKey": SECRET}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert send({"apiKey": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_key_returns_401(self):
        assert send(body="{not json").status_code == 401


class TestEvents:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = send({"apiKey": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = send({"apiKey": SECRET}, body=json.dumps(sample_payload("somethingNew")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
