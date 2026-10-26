import json
import os

# Set test environment variables before importing the app
CREDENTIAL = "Bearer 7f3c9a1e-5b2d-4c68-8e0a-91d4b6c2f375"
os.environ["REV_AI_AUTHORIZATION"] = CREDENTIAL

from fastapi.testclient import TestClient

from main import app, verify_rev_ai_request

client = TestClient(app)

# Shapes taken from the Rev AI webhooks documentation
TRANSCRIBED = {
    "job": {
        "id": "Umx5c6F7pH7r",
        "status": "transcribed",
        "created_on": "2018-05-05T23:23:22.29Z",
        "duration_seconds": 356.24,
    }
}
FAILED = {
    "job": {
        "id": "Umx5c6F7pH7r",
        "status": "failed",
        "created_on": "2018-05-05T23:23:22.29Z",
        "failure": "download_failure",
        "failure_detail": "Failed to download media file. Please check your url and file type",
    }
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(TRANSCRIBED)
    return client.post(
        "/webhooks/rev-ai",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestRevAiWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": CREDENTIAL})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_failed_job(self):
        res = post(json.dumps(FAILED), {"Authorization": CREDENTIAL})
        assert res.status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_rejects_token_without_scheme_prefix(self):
        res = post(headers={"Authorization": CREDENTIAL.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_different_scheme(self):
        res = post(headers={"Authorization": CREDENTIAL.replace("Bearer", "Basic")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(TRANSCRIBED), {"Authorization": CREDENTIAL}, "text/plain")
        assert res.status_code == 200

    def test_auth_checked_before_parsing(self):
        assert post("not json", {"Authorization": "Bearer wrong"}).status_code == 401

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": CREDENTIAL}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": CREDENTIAL}).status_code == 400

    def test_unknown_status_acknowledged(self):
        body = json.dumps({"job": {"id": "x", "status": "in_progress"}})
        assert post(body, {"Authorization": CREDENTIAL}).status_code == 200

    def test_non_ascii_credential_does_not_raise(self):
        res = post(headers={"Authorization": "Bearer ünï".encode("utf-8")})
        assert res.status_code == 401

    def test_never_accepts_when_unconfigured(self):
        assert verify_rev_ai_request({"authorization": "Bearer x"}, {}) is False
        assert verify_rev_ai_request({"authorization": ""}, {"REV_AI_AUTHORIZATION": ""}) is False
