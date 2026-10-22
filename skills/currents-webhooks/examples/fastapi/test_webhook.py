import json
import os

# Set test environment variables before importing the app
os.environ["CURRENTS_WEBHOOK_HEADER"] = "Authorization"
os.environ["CURRENTS_WEBHOOK_SECRET"] = "Bearer test_currents_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_currents_request

client = TestClient(app)

SECRET = os.environ["CURRENTS_WEBHOOK_SECRET"]

EVENTS = ["RUN_START", "RUN_FINISH", "RUN_TIMEOUT", "RUN_CANCELED"]


def sample_payload(event="RUN_FINISH"):
    return {
        "event": event,
        "runUrl": "https://app.currents.dev/run/950a13c3edf4f28b6e8ce301a404b4aa",
        "buildId": "demo-build-cdx3314",
        "groupId": "chromium",
        "tags": ["smoke"],
        "commit": {"sha": "5a7edc9a156e417068060d67109021351fc7d9b8", "branch": "feature-A"},
        "overall": 24, "passes": 21, "failures": 2, "pending": 0, "skipped": 1, "retries": 3, "flaky": 1,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/currents",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_exact_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_forged_timestamp_does_not_authenticate(self):
        assert post({"x-timestamp": "1700000000000"}).status_code == 401

    def test_custom_header_name(self):
        assert verify_currents_request(Headers({"x-currents-secret": "abc"}), "abc", "X-Currents-Secret") is True
        assert verify_currents_request(Headers({"x-currents-secret": "abd"}), "abc", "X-Currents-Secret") is False
        assert verify_currents_request(Headers({"authorization": "abc"}), "abc", "X-Currents-Secret") is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_currents_request(Headers({"authorization": "sécret"}), "sécret") is True
        assert verify_currents_request(Headers({"authorization": "sécrèt"}), "sécret") is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_currents_request(Headers({"authorization": SECRET}), secret="") is False
        assert verify_currents_request(Headers({"authorization": SECRET}), secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("RUN_SOMETHING_NEW")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
