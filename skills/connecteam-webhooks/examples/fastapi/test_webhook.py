import json
import os

# Set test environment variables before importing the app
os.environ["CONNECTEAM_WEBHOOK_SECRET"] = "test_connecteam_secret_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_connecteam_request

client = TestClient(app)

SECRET = os.environ["CONNECTEAM_WEBHOOK_SECRET"]
PATH = "/webhooks/connecteam"
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Payloads follow the documented samples (users, forms, time activity, scheduler, tasks, chat).
PAYLOADS = {
    "user_created": {
        "requestId": "ba973227-6f19-4e5f-8847-875147a05cb9",
        "company": "your_company_id",
        "activityType": "User",
        "eventTimestamp": 1731595939,
        "eventType": "user_created",
        "data": [{"userId": 9063791, "firstName": "John", "lastName": "Smith",
                  "email": "john@example.com", "isArchived": False}],
    },
    "form_submission": {
        "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "company": "your_company_id",
        "activityType": "forms",
        "eventType": "form_submission",
        "eventTimestamp": 1736760013,
        "data": {"formSubmissionId": "5b43a76b1d41c85da1ff8b77", "formId": 12345,
                 "submittingUserId": 9063791, "answers": []},
    },
    # Time Activity payloads are flat: userId and timeClockId sit at the root.
    "clock_in": {
        "requestId": "550e8400-e29b-41d4-a716-446655440010",
        "company": "123456",
        "activityType": "timesheet",
        "eventTimestamp": 1786878000,
        "eventType": "clock_in",
        "userId": 145,
        "timeClockId": 67,
        "webhookVersion": 1,
    },
    "user_timesheet_approved": {
        "requestId": "550e8400-e29b-41d4-a716-446655440011",
        "company": "123456",
        "activityType": "timesheet_period",
        "eventTimestamp": 1786878000,
        "eventType": "user_timesheet_approved",
        "userId": 145,
        "performedByUserId": 999,
        "timeClockId": 67,
        "startDate": "2026-08-10",
        "endDate": "2026-08-16",
        "timezone": "America/New_York",
        "webhookVersion": 1,
    },
    "shift_created": {
        "webhookVersion": 2,
        "eventType": "shift_created",
        "requestId": "b28d441c-e416-4c11-adb0-c8e0364ff29c",
        "company": "your_company_id",
        "activityType": "shift",
        "eventTimestamp": 1736760013,
        "schedulerId": 9454799,
        "data": {"shifts": [{"id": "6784dacb3c07733b0a849f49", "title": "Morning Shift",
                             "assignedUserIds": [9170357]}]},
    },
    "task_completed": {
        "requestId": "c0ffee00-0000-4000-8000-000000000001",
        "company": "your_company_id",
        "activityType": "tasks",
        "eventTimestamp": 1736760013,
        "eventType": "task_completed",
        "data": {"taskId": "task-1"},
    },
    "message_created": {
        "requestId": "c0ffee00-0000-4000-8000-000000000002",
        "company": "your_company_id",
        "activityType": "chat",
        "eventTimestamp": 1736760013,
        "eventType": "message_created",
        "data": {"messageId": "msg-1"},
    },
}

EVENTS = [
    "user_created", "user_updated", "user_deleted", "user_archived", "user_restored",
    "user_promoted", "user_demoted", "form_submission", "form_submission_edited",
    "manager_field_updated", "clock_in", "clock_out", "auto_clock_out", "admin_add",
    "admin_edit", "admin_delete", "user_timesheet_submitted", "user_timesheet_unsubmitted",
    "user_timesheet_approved", "user_timesheet_reopened", "shift_created", "shift_updated",
    "shift_deleted", "availability_status_created", "availability_status_deleted",
    "task_published", "task_completed", "message_created", "message_updated",
    "message_deleted", "conversation_created", "conversation_updated", "conversation_deleted",
]


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PAYLOADS["user_created"])
    return client.request(
        method,
        PATH,
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def auth(extra=None):
    return {"x-webhook-secret": SECRET, **(extra or {})}


class TestSecretVerification:
    def test_accepts_correct_secret(self):
        res = send(headers=auth())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        res = send(headers={"X-Webhook-Secret": SECRET})
        assert res.status_code == 200

    def test_rejects_wrong_secret_of_same_length(self):
        res = send(headers={"x-webhook-secret": "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_secret_of_different_length(self):
        res = send(headers={"x-webhook-secret": "short"})
        assert res.status_code == 401

    def test_rejects_prefix_of_secret(self):
        res = send(headers={"x-webhook-secret": SECRET[:-1]})
        assert res.status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_empty_header(self):
        assert send(headers={"x-webhook-secret": ""}).status_code == 401

    def test_rejects_when_secret_not_configured(self):
        assert verify_connecteam_request({"x-webhook-secret": SECRET}, "") is False

    def test_checks_credential_before_parsing_body(self):
        assert send(body="not json").status_code == 401

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_connecteam_request({"x-webhook-secret": "sécret"}, "other") is False
        assert verify_connecteam_request({"x-webhook-secret": "sécret"}, "sécret") is True


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_secret_and_empty_body(self, method):
        res = client.request(method, PATH, headers=auth())
        assert res.status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_method_without_secret(self, method):
        res = client.request(method, PATH)
        assert res.status_code == 401

    def test_accepts_put_with_json_body(self):
        assert send("PUT", headers=auth()).status_code == 200


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert send(headers=auth(), content_type="text/plain").status_code == 200

    def test_empty_body_returns_200(self):
        assert send(headers=auth(), body="").status_code == 200

    def test_invalid_json_returns_400(self):
        assert send(headers=auth(), body="{not json").status_code == 400

    def test_json_array_returns_400(self):
        assert send(headers=auth(), body="[]").status_code == 400


class TestEventHandling:
    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_documented_payload_shapes(self, name):
        res = send(headers=auth(), body=json.dumps(PAYLOADS[name]))
        assert res.status_code == 200

    @pytest.mark.parametrize("event_type", EVENTS)
    def test_acknowledges_event(self, event_type):
        body = json.dumps({**PAYLOADS["user_created"], "eventType": event_type})
        assert send(headers=auth(), body=body).status_code == 200

    def test_acknowledges_unknown_event(self):
        body = json.dumps({**PAYLOADS["user_created"], "eventType": "something_new"})
        assert send(headers=auth(), body=body).status_code == 200


def test_health():
    assert client.get("/health").status_code == 200
