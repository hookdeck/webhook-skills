import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["LESSONLY_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_lessonly_request

client = TestClient(app)

# ILLUSTRATIVE lesson-completed body: Lessonly does not document the payload
LESSON_COMPLETED = {
    "lesson_id": 1234,
    "user_id": 5678,
    "completed_at": "2026-10-25T12:00:00Z",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(LESSON_COMPLETED)
    return client.post(
        "/webhooks/lessonly",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestLessonlyWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        res = post(headers={"Authorization": "Bearer 00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 401

    def test_rejects_token_without_bearer_prefix(self):
        res = post(headers={"Authorization": AUTH.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_does_not_swap_scheme(self):
        res = post(headers={"Authorization": "Basic " + AUTH.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(headers={"Authorization": AUTH}, content_type="text/plain")
        assert res.status_code == 200

    def test_returns_401_before_parsing_invalid_body(self):
        assert post(body="not json").status_code == 401

    def test_returns_400_for_invalid_json(self):
        assert post(body="not json", headers={"Authorization": AUTH}).status_code == 400

    def test_returns_400_for_json_array(self):
        assert post(body="[1,2]", headers={"Authorization": AUTH}).status_code == 400

    def test_non_ascii_header_does_not_raise(self):
        config = {"LESSONLY_AUTHORIZATION": "Bearer é"}
        assert verify_lessonly_request({"authorization": "Bearer é"}, config) is True
        assert verify_lessonly_request({"authorization": "Bearer e"}, config) is False

    def test_never_accepts_when_unconfigured(self):
        assert verify_lessonly_request({"authorization": "Bearer x"}, {}) is False
        assert (
            verify_lessonly_request({"authorization": ""}, {"LESSONLY_AUTHORIZATION": ""}) is False
        )
