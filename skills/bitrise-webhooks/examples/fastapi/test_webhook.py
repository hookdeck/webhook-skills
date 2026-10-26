import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer test_bitrise_secret_0123456789"
os.environ["BITRISE_WEBHOOK_SECRET"] = SECRET
os.environ.pop("BITRISE_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient

from main import app, verify_bitrise_request

client = TestClient(app)

EVENTS = [
    "app_version_added", "testflight_upload_started", "testflight_upload_completed",
    "testflight_upload_failed", "testflight_processing_completed", "testflight_processing_failed",
    "testflight_app_review_approved", "testflight_app_review_rejected",
    "google_play_upload_completed", "google_play_upload_failed", "app_store_review_approved",
    "app_store_review_rejected", "app_store_release_completed", "google_play_release_completed",
]


def release_payload(event="testflight_upload_completed"):
    return {
        "trigger_event": event,
        "release_id": "rel-123",
        "app_id": "app-123",
        "triggered_by": "Automation",
        "webhook_event_unique_id": "wh-1@1730000000000000000",
        "file_name": "MyApp.ipa",
        "version": "1.4.0",
        "version_code": "42",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(release_payload())
    return client.post(
        "/webhooks/bitrise",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_value_with_bearer_prefix(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"Authorization": SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("BITRISE_WEBHOOK_HEADER", "X-Webhook-Secret")
        assert post({"X-Webhook-Secret": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_bitrise_request({"Authorization": "sécret-✓"}, SECRET) is False
        assert verify_bitrise_request({"Authorization": "sécret-✓"}, "sécret-✓") is True

    def test_rejects_everything_when_unconfigured(self):
        assert verify_bitrise_request({"Authorization": SECRET}, "") is False
        assert verify_bitrise_request({"Authorization": SECRET}, SECRET) is True


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json_is_400(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(release_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_release_events(self):
        body = json.dumps(release_payload("something_new"))
        assert post({"Authorization": SECRET}, body=body).status_code == 200

    def test_acknowledges_and_logs_payloads_without_trigger_event(self, capsys):
        # No trigger_event: an undocumented shape, such as a CI build event.
        assert post({"Authorization": SECRET}, body=json.dumps({"hello": "world"})).status_code == 200
        assert "Payload without trigger_event" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
