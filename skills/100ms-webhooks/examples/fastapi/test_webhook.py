import json
import os

# Set test environment variables before importing the app
os.environ["HUNDRED_MS_WEBHOOK_SECRET"] = "Bearer test_100ms_secret_0123456789"
os.environ.pop("HUNDRED_MS_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient

from main import app, seen_event_ids, verify_100ms_request

client = TestClient(app)

SECRET = os.environ["HUNDRED_MS_WEBHOOK_SECRET"]

EVENTS = [
    "session.open.success", "session.close.success",
    "peer.join.success", "peer.leave.success", "peer.join.failure", "peer.leave.failure",
    "room.end.success",
    "track.recording.started.success", "track.recording.success", "track.recording.failure",
    "stream.recording.success", "stream.recording.failure",
    "recording.success", "recording.failed",
    "beam.started.success", "beam.stopped.success", "beam.recording.success", "beam.failure",
    "hls.started.success", "hls.stopped.success", "hls.recording.success", "hls.failure",
    "role.change.success",
    "transcription.started.success", "transcription.success", "transcription.failure",
    "ingest.start.success", "ingest.end.success", "ingest.start.failure", "ingest.failure",
    "sip.start.success", "sip.start.failure", "sip.end.success", "sip.end.failure",
]


@pytest.fixture(autouse=True)
def clear_seen():
    seen_event_ids.clear()


def sample_payload(event_type="peer.join.success", event_id="6c75de35-b778-4fb0-88ae-114c28dc285f"):
    # Based on the sample peer.join.success payload in the 100ms docs.
    return {
        "version": "2.0",
        "id": event_id,
        "account_id": "60b8e13a6eb86d8101b57354",
        "timestamp": "2021-08-08T07:04:15Z",
        "type": event_type,
        "data": {
            "joined_at": "2021-08-08T07:04:15.001380432Z",
            "peer_id": "83b869e1-9a4b-4037-84b2-913cf76e4392",
            "role": "host",
            "room_id": "60b8e13a6eb86d8101b57354",
            "room_name": "test room",
            "session_id": "610f81ee870dde099a249948",
            "template_id": "66112497abcd52312556c4gg",
            "user_id": "user.001",
            "user_name": "test user",
        },
    }


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/100ms", content=body, headers=all_headers)


class TestSecretHeaderVerification:
    def test_accepts_exact_whole_header_value(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        assert post(headers={"authorization": SECRET}).status_code == 200

    def test_does_not_strip_bearer_prefix(self):
        res = post(headers={"Authorization": SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post(headers={"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post(headers={"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        monkeypatch.delenv("HUNDRED_MS_WEBHOOK_SECRET")
        assert verify_100ms_request({"authorization": SECRET}) is False
        assert verify_100ms_request({"authorization": SECRET}, secret="") is False

    def test_supports_custom_header_name(self):
        assert verify_100ms_request({"x-hms-secret": "s3cret"}, "s3cret", "X-HMS-Secret") is True
        assert verify_100ms_request({"authorization": "s3cret"}, "s3cret", "X-HMS-Secret") is False

    def test_handles_non_ascii_secret_without_raising(self):
        secret = "sécret-ключ"
        sent = secret.encode("utf-8").decode("latin-1")  # how Starlette decodes the header
        assert verify_100ms_request({"authorization": sent}, secret) is True
        assert verify_100ms_request({"authorization": "secret-key"}, secret) is False
        assert verify_100ms_request({"authorization": "é"}, "plain") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_400_for_invalid_json_after_authenticating(self):
        assert post(body="{not json", headers={"Authorization": SECRET}).status_code == 400

    def test_400_for_json_without_type(self):
        assert post(body='{"id":"1"}', headers={"Authorization": SECRET}).status_code == 400

    def test_401_not_400_for_invalid_json_without_header(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post(body=json.dumps(sample_payload(event_type)), headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = post(body=json.dumps(sample_payload("something.new.success")), headers={"Authorization": SECRET})
        assert res.status_code == 200

    def test_dedupes_retried_deliveries_on_id(self, capsys):
        first = post(headers={"Authorization": SECRET})
        retry = post(headers={"Authorization": SECRET})
        assert first.json() == {"received": True}
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Peer joined") == 1


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
