import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "rocketlane"
PASSWORD = "p@ss:word/with+colon"
os.environ["ROCKETLANE_WEBHOOK_USERNAME"] = USERNAME
os.environ["ROCKETLANE_WEBHOOK_PASSWORD"] = PASSWORD

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_rocketlane_request

client = TestClient(app)


def basic(user=USERNAME, password=PASSWORD):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")


# Shapes taken from Rocketlane's documented sample payloads (trimmed)
TASK_CREATED = {
    "eventId": "b6c68150-86f3-4a26-9a5f-66db5ca24b87",
    "resourceType": "TASK",
    "eventType": "TASK_CREATED",
    "version": "1.0",
    "data": {"task": {"taskId": 278, "taskName": "task2"}},
    "eventOccurredAt": 1702266225732,
    "eventTriggeredAt": 1702266229620,
}
TASK_UPDATED = {
    "eventId": "a3c7825b-9c89-42ac-8859-50e243d0c131",
    "resourceType": "TASK",
    "eventType": "TASK_UPDATED",
    "version": "1.0",
    "data": {"task": {"taskId": 318, "taskName": "Hire Chief Operating Officer"}},
    "changeLog": {
        "changedFields": ["taskName"],
        "from": {"taskName": "Hire operations head"},
        "to": {"taskName": "Hire Chief Operating Officer"},
    },
}


def post(body=None, authorization=None, content_type="application/json"):
    content = body if body is not None else json.dumps(TASK_CREATED)
    headers = {"Content-Type": content_type}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/rocketlane", content=content, headers=headers)


class TestRocketlaneWebhook:
    def test_accepts_valid_basic_credentials(self):
        res = post(authorization=basic())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme_and_colon_in_password(self):
        res = post(json.dumps(TASK_UPDATED), basic().replace("Basic", "basic"))
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        assert post(authorization=basic(), content_type="text/plain").status_code == 200

    def test_rejects_missing_authorization(self):
        assert post().status_code == 401

    def test_rejects_wrong_password(self):
        assert post(authorization=basic(USERNAME, "nope")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(authorization=basic("someone", PASSWORD)).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(authorization=f"Bearer {PASSWORD}").status_code == 401

    def test_rejects_valid_credentials_followed_by_junk(self):
        assert post(authorization=basic() + "!!!").status_code == 401
        assert post(authorization=basic() + " extra").status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"rocketlane").decode("ascii")
        assert post(authorization=header).status_code == 401

    def test_checks_credential_before_parsing_body(self):
        assert post("not json", basic("x", "y")).status_code == 401

    def test_invalid_json_returns_400(self):
        assert post("not json", basic()).status_code == 400

    def test_non_object_json_returns_400(self):
        assert post("[1, 2]", basic()).status_code == 400

    @pytest.mark.parametrize("event_type", ["TASK_DELETED", "PROJECT_CREATED", "PHASE_UPDATED", "SOMETHING_NEW"])
    def test_handles_event_types(self, event_type):
        res = post(json.dumps({**TASK_CREATED, "eventType": event_type}), basic())
        assert res.status_code == 200


class TestVerify:
    def test_fails_closed_when_unconfigured(self):
        assert verify_rocketlane_request({"authorization": basic()}, {}) is False
        empty = {"ROCKETLANE_WEBHOOK_USERNAME": "", "ROCKETLANE_WEBHOOK_PASSWORD": ""}
        assert verify_rocketlane_request({"authorization": basic("", "")}, empty) is False

    def test_non_ascii_credentials(self):
        config = {"ROCKETLANE_WEBHOOK_USERNAME": "usér", "ROCKETLANE_WEBHOOK_PASSWORD": "pässwörd"}
        assert verify_rocketlane_request({"authorization": basic("usér", "pässwörd")}, config) is True
        assert verify_rocketlane_request({"authorization": basic("usér", "passwörd")}, config) is False

    def test_parse_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c")) == (b"a", b"b:c")

    def test_parse_rejects_malformed(self):
        assert parse_basic_auth(None) is None
        assert parse_basic_auth("Basic") is None
        assert parse_basic_auth("Basic !!!!") is None
        assert parse_basic_auth("Basic abc") is None
