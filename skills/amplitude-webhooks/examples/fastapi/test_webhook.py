import json
import os

# Set test environment variables before importing the app
os.environ["AMPLITUDE_WEBHOOK_HEADER"] = "X-Amplitude-Secret"
os.environ["AMPLITUDE_WEBHOOK_SECRET"] = "Bearer test_amplitude_secret_0123456789"

from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_amplitude_request

client = TestClient(app)

HEADER = os.environ["AMPLITUDE_WEBHOOK_HEADER"]
SECRET = os.environ["AMPLITUDE_WEBHOOK_SECRET"]

EVENT_PAYLOAD = {
    "event_type": "Button Clicked",
    "user_id": "user-123",
    "event_time": "2026-10-22 20:07:01.795",
    "event_properties": {"button": "signup"},
    "user_properties": {"plan": "growth"},
}

USER_PAYLOAD = {"user_id": "user-123", "user_properties": {"email": "a@example.com"}}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(EVENT_PAYLOAD)
    return client.post(
        "/webhooks/amplitude",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_exact_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_under_other_header(self):
        assert post({"Authorization": SECRET}).status_code == 401


class TestVerifyFunction:
    def test_defaults_header_to_authorization(self, monkeypatch):
        monkeypatch.delenv("AMPLITUDE_WEBHOOK_HEADER")
        assert verify_amplitude_request(Headers({"authorization": "Bearer abc"}), "Bearer abc") is True

    def test_false_when_unconfigured(self):
        assert verify_amplitude_request(Headers({HEADER: SECRET}), "") is False

    def test_non_ascii_does_not_raise(self):
        # compare_digest raises TypeError on non-ASCII str, so both sides are encoded.
        assert verify_amplitude_request({"x-h": "sécret-✓"}, "sécret-✓", "x-h") is True
        assert verify_amplitude_request({"x-h": "sécret-✗"}, "sécret-✓", "x-h") is False


class TestPayloadHandling:
    def test_event(self):
        assert post({HEADER: SECRET}).status_code == 200

    def test_user_update(self):
        assert post({HEADER: SECRET}, json.dumps(USER_PAYLOAD)).status_code == 200

    def test_custom_template_payload(self):
        body = json.dumps({"name": "click event", "external_id": "u1"})
        assert post({HEADER: SECRET}, body).status_code == 200

    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_auth_before_parse(self):
        assert post(body="not json").status_code == 401

    def test_invalid_json_400(self):
        assert post({HEADER: SECRET}, "not json").status_code == 400

    def test_array_400(self):
        assert post({HEADER: SECRET}, "[]").status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
