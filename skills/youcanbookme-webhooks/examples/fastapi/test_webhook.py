import json
import os

# Set test environment variables before importing the app
os.environ["YOUCANBOOKME_WEBHOOK_HEADER"] = "X-Ycbm-Secret"
os.environ["YOUCANBOOKME_WEBHOOK_SECRET"] = "Bearer test_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_youcanbookme_request

client = TestClient(app)

HEADER = os.environ["YOUCANBOOKME_WEBHOOK_HEADER"]
SECRET = os.environ["YOUCANBOOKME_WEBHOOK_SECRET"]

EVENTS = [
    "booking_made", "booking_rescheduled", "booking_cancelled", "reminder", "follow_up", "no_show",
]


def sample_payload(event="booking_made"):
    return {"event": event, "email": "jane@example.com", "start": "2026-11-02 10:00"}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/youcanbookme",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_accepts_correct_header_and_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={HEADER.lower(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer_prefix(self):
        assert send(headers={HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_secret_under_other_header_name(self):
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        assert verify_youcanbookme_request({HEADER: "sécrét-✓"}, secret=SECRET, header_name=HEADER) is False
        assert verify_youcanbookme_request({HEADER: "sécrét-✓"}, secret="sécrét-✓", header_name=HEADER) is True

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        headers = {HEADER: SECRET}
        assert verify_youcanbookme_request(headers, secret="") is False
        monkeypatch.delenv("YOUCANBOOKME_WEBHOOK_SECRET")
        assert verify_youcanbookme_request(headers) is False

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("YOUCANBOOKME_WEBHOOK_HEADER")
        assert verify_youcanbookme_request({"Authorization": SECRET}) is True
        assert verify_youcanbookme_request({"Authorization": "nope"}) is False


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_method_with_body(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    def test_accepts_get_with_empty_body(self):
        res = client.get("/webhooks/youcanbookme", headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_post_with_empty_body(self):
        assert send(headers={HEADER: SECRET}, body="").status_code == 200

    def test_rejects_unauthenticated_get(self):
        assert client.get("/webhooks/youcanbookme").status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send(headers={HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert send(headers={HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert send(body="{not json").status_code == 401


class TestEvents:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
