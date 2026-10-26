import json
import os

# Set test environment variables before importing the app
os.environ["SONIOX_WEBHOOK_HEADER"] = "Authorization"
os.environ["SONIOX_WEBHOOK_SECRET"] = "Bearer test_soniox_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_soniox_request

client = TestClient(app)

SECRET = os.environ["SONIOX_WEBHOOK_SECRET"]


def sample_payload(status="completed"):
    # Payload as shown in Soniox's docs
    return {"id": "548d023b-2b3d-4dc2-a3ef-cca26d05fd9a", "status": status}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/soniox",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthHeaderVerification:
    def test_correct_whole_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bare_token_without_bearer_rejected(self):
        assert post({"Authorization": "test_soniox_secret_0123456789"}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_unconfigured_secret_rejects(self):
        assert verify_soniox_request({"authorization": SECRET}, secret="") is False

    def test_custom_header_name(self):
        assert verify_soniox_request({"x-soniox-secret": "abc123"}, name="X-Soniox-Secret", secret="abc123")
        assert not verify_soniox_request({"authorization": "abc123"}, name="X-Soniox-Secret", secret="abc123")

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_soniox_request({"authorization": "pässword"}, secret="pässword") is True
        assert verify_soniox_request({"authorization": "password"}, secret="pässword") is False


class TestStatuses:
    @pytest.mark.parametrize("status", ["completed", "error"])
    def test_documented_statuses(self, status):
        res = post({"Authorization": SECRET}, json.dumps(sample_payload(status)))
        assert res.status_code == 200

    def test_unknown_status_accepted(self):
        res = post({"Authorization": SECRET}, json.dumps(sample_payload("queued")))
        assert res.status_code == 200


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({"Authorization": SECRET}, "not json").status_code == 400

    def test_non_object_body(self):
        assert post({"Authorization": SECRET}, "[1,2]").status_code == 400

    def test_bad_json_without_header_is_401(self):
        assert post(body="not json").status_code == 401
