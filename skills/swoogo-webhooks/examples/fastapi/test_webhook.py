import json
import os

# Set test environment variables before importing the app
os.environ["SWOOGO_WEBHOOK_HEADER"] = "Authorization"
os.environ["SWOOGO_WEBHOOK_SECRET"] = "Bearer test_swoogo_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_swoogo_request

client = TestClient(app)

SECRET = os.environ["SWOOGO_WEBHOOK_SECRET"]

OBJECTS = [
    "event", "contact", "registrant", "speaker", "sponsor", "session",
    "session_attendance", "registrant_line_item",
]

# Illustrative: Swoogo documents no delivered example, the body carries the chosen fields.
PAYLOAD = {"id": 1234, "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com"}


def post(headers=None, body=None, obj="registrant", content_type="application/json"):
    content = body if body is not None else json.dumps(PAYLOAD)
    return client.post(
        f"/webhooks/swoogo?object={obj}",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeader:
    def test_exact_whole_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_does_not_strip_bearer_prefix(self):
        assert post({"Authorization": "test_swoogo_secret_0123456789"}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_custom_header_name(self):
        headers = {"x-webhook-secret": "s3cret value"}
        assert verify_swoogo_request(headers, "X-Webhook-Secret", "s3cret value") is True
        assert verify_swoogo_request(headers, "X-Webhook-Secret", "s3cret") is False
        assert verify_swoogo_request(headers, "Authorization", "s3cret value") is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_swoogo_request({"authorization": "Bearer café"}, "Authorization", "Bearer café") is True
        assert verify_swoogo_request({"authorization": "Bearer cafe"}, "Authorization", "Bearer café") is False

    def test_rejects_when_unconfigured(self, monkeypatch):
        monkeypatch.delenv("SWOOGO_WEBHOOK_SECRET")
        assert verify_swoogo_request({"authorization": SECRET}) is False


class TestBodyHandling:
    def test_form_encoded_body(self):
        res = post(
            {"Authorization": SECRET},
            body="id=1234&first_name=Ada&email=ada%40example.com",
            content_type="application/x-www-form-urlencoded",
        )
        assert res.status_code == 200

    def test_other_content_type_with_json(self):
        assert post({"Authorization": SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_body_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestTriggerObjects:
    @pytest.mark.parametrize("obj", OBJECTS)
    def test_handles_object(self, obj, capsys):
        res = post({"Authorization": SECRET}, obj=obj)
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_object(self):
        assert post({"Authorization": SECRET}, obj="something_new").status_code == 200
