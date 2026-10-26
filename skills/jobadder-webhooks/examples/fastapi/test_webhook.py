import json
import os

# Set test environment variables before importing the app
AUTH = "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
os.environ["JOBADDER_AUTHORIZATION"] = AUTH

import base64

import pytest
from fastapi.testclient import TestClient

from main import app, verify_jobadder_request

client = TestClient(app)


def envelope(event):
    """Envelope from JobAdder's documented notification message."""
    return {
        "apiVersion": 2,
        "event": event,
        "eventId": "00000000-0000-0000-0000-000000000000",
        "eventDate": "2019-01-01T09:00:00Z",
        "eventUser": {},
        "eventData": {},
    }


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(envelope("placement_approved"))
    return client.post(
        "/webhooks/jobadder",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestJobAdderWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Basic d3Jvbmc6d3Jvbmc="}).status_code == 401

    def test_rejects_credential_without_scheme_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Basic ", "")}).status_code == 401

    def test_rejects_decoded_username_password(self):
        decoded = base64.b64decode(AUTH.replace("Basic ", "")).decode()
        assert post(headers={"Authorization": decoded}).status_code == 401

    def test_non_ascii_header_returns_401_not_500(self):
        res = post(headers={"Authorization": "Basic café".encode("latin-1")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(envelope("job_status_changed")), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    @pytest.mark.parametrize(
        "event",
        [
            "candidate_status_changed",
            "job_status_changed",
            "jobapplication_status_changed",
            "placement_approved",
            "interview_scheduled",
        ],
    )
    def test_accepts_events(self, event):
        assert post(json.dumps(envelope(event)), {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_jobadder_request({"authorization": "Basic x"}, {}) is False
        assert verify_jobadder_request({"authorization": ""}, {"JOBADDER_AUTHORIZATION": ""}) is False
