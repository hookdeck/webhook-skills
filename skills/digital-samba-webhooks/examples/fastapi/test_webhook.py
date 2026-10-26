import json
import os

# Set test environment variables before importing the app
os.environ["DIGITAL_SAMBA_WEBHOOK_SECRET"] = "test_digital_samba_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_digital_samba_request

client = TestClient(app)

SECRET = os.environ["DIGITAL_SAMBA_WEBHOOK_SECRET"]

EVENTS = [
    "participant_joined", "participant_left", "session_started", "session_ended",
    "recording_started", "recording_stopped", "recording_ready", "recording_deleted",
    "session_summary_ready", "session_transcript_ready",
]


def sample_payload(event_type="participant_joined"):
    # Based on the documented participant_joined payload
    return {
        "eventType": event_type,
        "sessionId": "4fcc375c-e0ce-4f52-9b35-3a034042ab5a",
        "roomId": "7f8c8eac-6643-47db-8d93-e7633e6e53ec",
        "timestamp": 1675790387,
        "data": {
            "participantId": "8b085f23-9a2a-465d-bdbb-73a233c7df90",
            "name": "John Smith",
            "role": "moderator",
        },
    }


def bearer(secret=SECRET):
    return {"Authorization": f"Bearer {secret}"}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/digital-samba",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBearerVerification:
    def test_correct_secret(self):
        res = post(bearer())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post({"Authorization": f"bearer {SECRET}"}).status_code == 200
        assert post({"Authorization": f"BEARER {SECRET}"}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post(bearer("x" * len(SECRET))).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post(bearer("short")).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bare_secret_without_scheme(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_other_scheme(self):
        assert post({"Authorization": f"Basic {SECRET}"}).status_code == 401

    def test_secret_is_not_trimmed(self):
        headers = {"authorization": f"Bearer {SECRET}"}
        assert verify_digital_samba_request(headers, secret=f" {SECRET}") is False

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"authorization": f"Bearer {SECRET}"}
        assert verify_digital_samba_request(headers, secret="") is False
        assert verify_digital_samba_request(headers, secret="Bearer ") is False
        assert verify_digital_samba_request(headers, secret=SECRET) is True

    def test_configured_bearer_prefix_is_stripped(self):
        headers = {"authorization": f"Bearer {SECRET}"}
        assert verify_digital_samba_request(headers, secret=f"Bearer {SECRET}") is True
        assert verify_digital_samba_request(headers, secret=f"bearer {SECRET}") is True

    def test_non_ascii_secret(self):
        secret = "sécret-ключ"
        header = f"Bearer {secret}".encode("utf-8").decode("latin-1")
        assert verify_digital_samba_request({"authorization": header}, secret=secret) is True
        assert verify_digital_samba_request({"authorization": "Bearer secret-xxx"}, secret=secret) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post(bearer(), content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post(bearer(), body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post(bearer(), body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post(bearer(), body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post(bearer(), body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
