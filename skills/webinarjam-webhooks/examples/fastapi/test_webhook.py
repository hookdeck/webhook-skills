import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer wj_test_3f9a1c7e5b2d4086"
os.environ["WEBINARJAM_WEBHOOK_SECRET"] = SECRET
os.environ.pop("WEBINARJAM_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_webinarjam_request

client = TestClient(app)

# Illustrative payload: WebinarJam does not document field names.
LEAD = {
    "event": "registered",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "email": "ada@example.com",
    "phone": "+15555550100",
    "live_room_link": "https://example.com/live",
    "replay_link": "https://example.com/replay",
    "unsubscribe_link": "https://example.com/unsubscribe",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(LEAD)
    return client.post(
        "/webhooks/webinarjam",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def test_accepts_whole_authorization_value():
    res = post(headers={"Authorization": SECRET})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_rejects_missing_header():
    assert post().status_code == 401


def test_rejects_wrong_token():
    assert post(headers={"Authorization": "Bearer nope"}).status_code == 401


def test_rejects_token_without_bearer_prefix():
    assert post(headers={"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401


def test_rejects_longer_value():
    assert post(headers={"Authorization": SECRET + "x"}).status_code == 401


def test_non_ascii_header_does_not_raise():
    res = post(headers={"Authorization": "Bearer café".encode("utf-8")})
    assert res.status_code == 401


def test_accepts_any_content_type():
    assert post(json.dumps(LEAD), {"Authorization": SECRET}, "text/plain").status_code == 200


def test_invalid_json_returns_400_once_authenticated():
    assert post("not json", {"Authorization": SECRET}).status_code == 400


def test_non_object_returns_400():
    assert post("[1]", {"Authorization": SECRET}).status_code == 400


@pytest.mark.parametrize(
    "event", ["registered", "attended_live", "missed_live", "left_early", "purchased", "other"]
)
def test_handles_triggers(event):
    res = post(json.dumps({**LEAD, "event": event}), {"Authorization": SECRET})
    assert res.status_code == 200


def test_returns_500_when_unconfigured(monkeypatch):
    monkeypatch.delenv("WEBINARJAM_WEBHOOK_SECRET")
    assert post(headers={"Authorization": SECRET}).status_code == 500


def test_custom_header_name_is_case_insensitive():
    config = {"WEBINARJAM_WEBHOOK_HEADER": "X-Webinar-Key", "WEBINARJAM_WEBHOOK_SECRET": "abc123"}
    assert verify_webinarjam_request(Headers({"x-webinar-key": "abc123"}), config)
    assert not verify_webinarjam_request(Headers({"x-webinar-key": "abc124"}), config)
    assert not verify_webinarjam_request(Headers({"authorization": "abc123"}), config)


def test_unset_secret_never_matches():
    assert not verify_webinarjam_request(Headers({"authorization": ""}), {})
    assert not verify_webinarjam_request(Headers({"authorization": ""}), {"WEBINARJAM_WEBHOOK_SECRET": ""})
