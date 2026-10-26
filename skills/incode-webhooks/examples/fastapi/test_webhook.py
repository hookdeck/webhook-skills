import json
import os

# Set test environment variables before importing the app
os.environ["INCODE_WEBHOOK_HEADER"] = "X-Incode-Auth"
os.environ["INCODE_WEBHOOK_SECRET"] = "Bearer test_incode_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, event_name, verify_incode_request

client = TestClient(app)

HEADER = os.environ["INCODE_WEBHOOK_HEADER"]
SECRET = os.environ["INCODE_WEBHOOK_SECRET"]

# (payload field carrying the name, event name)
EVENTS = [
    ("event_type", "SESSION_STARTED"),
    ("event_type", "SESSION_PROGRESS"),
    ("event_type", "SESSION_SUCCEEDED"),
    ("event_type", "SESSION_FAILED"),
    ("event_type", "SESSION_PENDING_REVIEW"),
    ("eventType", "IDENTITY_ENROLLED"),
    ("onboardingStatus", "ID_VALIDATION_FINISHED"),
    ("onboardingStatus", "ID_VALIDATION_FINISHED_SECOND_ID"),
    ("onboardingStatus", "GOVERNMENT_VALIDATION_FINISHED"),
    ("onboardingStatus", "FACE_VALIDATION_FINISHED"),
    ("onboardingStatus", "POST_PROCESSING_FINISHED"),
    ("onboardingStatus", "POST_PROCESSING_FINISHED_SECOND_ID"),
    ("onboardingStatus", "ONBOARDING_FINISHED"),
    ("onboardingStatus", "MANUAL_REVIEW_APPROVED"),
    ("onboardingStatus", "MANUAL_REVIEW_REJECTED"),
    ("onboardingStatus", "EXPIRED"),
    ("onboardingStatus", "DELETED"),
]


def sample_payload(field="event_type", name="SESSION_SUCCEEDED"):
    return {
        field: name,
        "interviewId": "664283755e0f8e1b87fcc2ce",
        "clientId": "MyClientId001",
        "identityId": "65f8aa",
        "interviewIds": ["664283755e0f8e1b87fcc2ce"],
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/incode",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderAuthentication:
    def test_accepts_the_correct_header_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"success": True}

    def test_answers_200_with_json_content_type(self):
        res = post({HEADER: SECRET})
        assert res.headers["content-type"].startswith("application/json")

    def test_matches_header_name_case_insensitively(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_compares_the_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_empty_header_value(self):
        assert post({HEADER: ""}).status_code == 401

    def test_does_not_authenticate_with_a_different_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_rejects_everything_when_secret_not_configured(self):
        assert verify_incode_request(Headers({HEADER: SECRET}), secret="") is False

    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("INCODE_WEBHOOK_HEADER")
        assert verify_incode_request(Headers({"authorization": SECRET})) is True
        assert verify_incode_request(Headers({HEADER: SECRET})) is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_incode_request({HEADER: "pässword"}, secret="pässword") is True
        assert verify_incode_request({HEADER: "pässword"}, secret="password") is False


class TestBodyHandling:
    @pytest.mark.parametrize(
        "content_type", ["application/json", "text/plain", "application/x-www-form-urlencoded"]
    )
    def test_reads_body_raw_for_any_content_type(self, content_type):
        assert post({HEADER: SECRET}, content_type=content_type).status_code == 200

    def test_rejects_invalid_json(self):
        assert post({HEADER: SECRET}, body="not json").status_code == 400

    def test_rejects_json_array(self):
        assert post({HEADER: SECRET}, body="[]").status_code == 400

    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("field,name", EVENTS)
    def test_handles_event(self, field, name, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(field, name)))
        assert res.status_code == 200
        assert res.json() == {"success": True}
        assert "Unhandled event" not in capsys.readouterr().out

    def test_unknown_event_is_unhandled_but_200(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps({"event_type": "SOMETHING_NEW"}))
        assert res.status_code == 200
        assert "Unhandled event: SOMETHING_NEW" in capsys.readouterr().out


class TestEventName:
    def test_reads_event_type_then_event_type_camel_then_onboarding_status(self):
        assert event_name({"event_type": "A", "eventType": "B", "onboardingStatus": "C"}) == "A"
        assert event_name({"eventType": "B", "onboardingStatus": "C"}) == "B"
        assert event_name({"onboardingStatus": "C"}) == "C"

    def test_prefers_event_type_for_session_webhooks(self):
        payload = {"event_type": "SESSION_SUCCEEDED", "onboardingStatus": "ONBOARDING_FINISHED"}
        assert event_name(payload) == "SESSION_SUCCEEDED"
