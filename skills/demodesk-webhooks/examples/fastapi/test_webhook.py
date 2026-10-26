import json
import os

# Set test environment variables before importing the app
os.environ["DEMODESK_WEBHOOK_HEADER"] = "X-Demodesk-Secret"
os.environ["DEMODESK_WEBHOOK_SECRET"] = "Bearer test_demodesk_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_demodesk_request

client = TestClient(app)

HEADER = os.environ["DEMODESK_WEBHOOK_HEADER"]
SECRET = os.environ["DEMODESK_WEBHOOK_SECRET"]

EVENTS = [
    "demo.scheduled", "demo.rescheduled", "demo.event_response_updated", "demo.handovered",
    "demo.canceled", "demo.started", "demo.call_note_updated", "demo.ended",
    "recording.uploaded", "recording.transcription_postprocessed",
]


def sample_payload(action="demo.scheduled"):
    return {"meta": {"event": {"action": action}}, "data": {"demo": {"id": "demo_123"}}}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/demodesk",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.upper(): SECRET}).status_code == 200

    def test_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header_name(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_is_rejected_not_500(self):
        res = client.post(
            "/webhooks/demodesk",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", HEADER.lower(): "pässword".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        assert verify_demodesk_request({HEADER: SECRET}, HEADER, "") is False
        saved = os.environ.pop("DEMODESK_WEBHOOK_SECRET")
        try:
            assert verify_demodesk_request({HEADER: SECRET}) is False
        finally:
            os.environ["DEMODESK_WEBHOOK_SECRET"] = saved

    def test_header_name_defaults_to_authorization(self):
        saved = os.environ.pop("DEMODESK_WEBHOOK_HEADER")
        try:
            assert verify_demodesk_request({"Authorization": SECRET}) is True
            assert verify_demodesk_request({HEADER: SECRET}) is False
        finally:
            os.environ["DEMODESK_WEBHOOK_HEADER"] = saved


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("action", EVENTS)
    def test_handles_event(self, action, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(action)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("demo.something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
