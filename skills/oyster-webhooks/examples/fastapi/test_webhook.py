import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer s3cr3t-shared-secret-12345"
os.environ["OYSTER_AUTHORIZATION"] = AUTH

import pytest
from fastapi.testclient import TestClient

from main import app, verify_oyster_request

client = TestClient(app)


# Envelope and data keys follow Oyster's documented webhook events
def make_event(event_name, data):
    return {
        "eventName": event_name,
        "eventTimestamp": "2026-04-21T09:35:13Z",
        "id": "wh_01J19XRFZ2Q4QBDC6CA461AGT7",
        "companyId": "ABC1234",
        "data": data,
    }


EVENTS = {
    "engaged": make_event("hiring.employment_engaged", {"engagementId": "eng_1"}),
    "approved": make_event(
        "expenses.expense_approved",
        {"expenseId": "exp_1", "reviewState": "approved", "previousReviewState": "pending"},
    ),
    "applied": make_event(
        "contract.change_applied",
        {"engagementChangeId": "chg_1", "changeType": "salary", "state": "applied"},
    ),
    "enrolled": make_event(
        "benefits.enrollment_enrolled", {"engagementId": "eng_1", "enrollmentId": "enr_1"}
    ),
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(EVENTS["engaged"])
    return client.post(
        "/webhooks/oyster",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthentication:
    def test_accepts_full_authorization_header_value(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(headers={"Authorization": "Bearer wrong-secret"}).status_code == 401

    def test_rejects_secret_without_bearer_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_rejects_header_of_different_length(self):
        assert post(headers={"Authorization": "Bearer x"}).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        # compare_digest raises TypeError for non-ASCII str, so both sides are encoded to bytes
        headers = {"Authorization": "Bearer sécret".encode("utf-8")}
        assert post(headers=headers).status_code == 401
        assert verify_oyster_request({"authorization": "Bearer sécret"}) is False
        assert verify_oyster_request(
            {"authorization": "Bearer sécret"}, {"OYSTER_AUTHORIZATION": "Bearer sécret"}
        ) is True

    def test_rejects_everything_when_unconfigured(self):
        assert verify_oyster_request({"authorization": AUTH}, {}) is False
        assert verify_oyster_request({"authorization": ""}, {"OYSTER_AUTHORIZATION": ""}) is False

    def test_authenticates_before_parsing(self):
        res = post(body="not json", headers={"Authorization": "Bearer nope"})
        assert res.status_code == 401


class TestEvents:
    @pytest.mark.parametrize("name", list(EVENTS))
    def test_handles_documented_events(self, name, capsys):
        res = post(body=json.dumps(EVENTS[name]), headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert capsys.readouterr().out != ""

    def test_logs_expense_approved_details(self, capsys):
        post(body=json.dumps(EVENTS["approved"]), headers={"Authorization": AUTH})
        assert "Expense exp_1 approved (pending -> approved)" in capsys.readouterr().out

    def test_unhandled_event_still_200(self):
        body = json.dumps(make_event("time_off.request_created", {}))
        assert post(body=body, headers={"Authorization": AUTH}).status_code == 200

    def test_accepts_any_content_type(self):
        res = post(
            body=json.dumps(EVENTS["applied"]),
            headers={"Authorization": AUTH},
            content_type="text/plain",
        )
        assert res.status_code == 200


class TestBadBodies:
    def test_invalid_json(self):
        assert post(body="not json", headers={"Authorization": AUTH}).status_code == 400

    def test_missing_event_name(self):
        res = post(body=json.dumps({"id": "wh_1", "data": {}}), headers={"Authorization": AUTH})
        assert res.status_code == 400

    def test_json_array(self):
        assert post(body="[]", headers={"Authorization": AUTH}).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
