import json
import os

# Set test environment variables before importing the app
NAME = "X-My-Webhook-Secret"
VALUE = "test_assemblyai_secret_0123456789"
os.environ["ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME"] = NAME
os.environ["ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE"] = VALUE

from fastapi.testclient import TestClient

from main import app, verify_assemblyai_request

client = TestClient(app)


def sample_payload(status="completed"):
    """What AssemblyAI delivers: only the transcript ID and a status."""
    return {"transcript_id": "5552493-16d8-42d8-8feb-c2a16b56f6e8", "status": status}


def post(headers=None, body=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    return client.post(
        "/webhooks/assemblyai",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestAuthHeader:
    def test_accepts_correct_value(self):
        res = post({NAME: VALUE})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({NAME.lower(): VALUE}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post({NAME: VALUE}, content_type="text/plain").status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert post({NAME: "x" * len(VALUE)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({NAME: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_value_under_different_header_name(self):
        assert post({"X-Other-Header": VALUE}).status_code == 401


class TestRequestHandling:
    def test_invalid_json_returns_400(self):
        assert post({NAME: VALUE}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post({NAME: VALUE}, body="[1,2,3]").status_code == 400

    def test_handles_completed_error_and_unknown_statuses(self):
        for status in ["completed", "error", "queued"]:
            res = post({NAME: VALUE}, body=json.dumps(sample_payload(status)))
            assert res.status_code == 200


class TestVerifyAssemblyAIRequest:
    def test_rejects_everything_when_unconfigured(self):
        assert verify_assemblyai_request({NAME.lower(): VALUE}, {}) is False

    def test_rejects_when_only_name_configured(self):
        config = {"ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME": "X-Token"}
        assert verify_assemblyai_request({"x-token": ""}, config) is False

    def test_uses_custom_header_name(self):
        config = {
            "ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME": "X-AAI-Token",
            "ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE": "s3cret",
        }
        assert verify_assemblyai_request({"x-aai-token": "s3cret"}, config) is True
        assert verify_assemblyai_request({NAME.lower(): "s3cret"}, config) is False


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
