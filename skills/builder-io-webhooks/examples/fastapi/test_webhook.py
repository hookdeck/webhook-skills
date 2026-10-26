import json
import os

# Set test environment variables before importing the app
os.environ["BUILDER_IO_WEBHOOK_HEADER"] = "X-Builder-Secret"
os.environ["BUILDER_IO_WEBHOOK_SECRET"] = "Bearer test_builder_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_builder_request

client = TestClient(app)

HEADER = os.environ["BUILDER_IO_WEBHOOK_HEADER"]
SECRET = os.environ["BUILDER_IO_WEBHOOK_SECRET"]

OPERATIONS = ["publish", "unpublish", "archive", "delete", "scheduledStart", "scheduledEnd"]


def sample_payload(operation="publish"):
    return {
        "newValue": None if operation == "delete" else {
            "id": "cs3df", "published": "published", "name": "My great page", "data": {"property": "value"},
        },
        "previousValue": None if operation == "publish" else {"id": "cs3df", "published": "draft"},
        "modelName": "page",
        "operation": operation,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/builder-io",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header(self):
        assert post({"X-Other": SECRET}).status_code == 401

    def test_bad_secret_rejected_before_parsing_body(self):
        assert post({HEADER: "wrong"}, body="not json").status_code == 401


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="not json").status_code == 400

    def test_json_array(self):
        assert post({HEADER: SECRET}, body="[]").status_code == 400


class TestOperations:
    @pytest.mark.parametrize("operation", OPERATIONS)
    def test_handles_operation(self, operation):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(operation)))
        assert res.status_code == 200

    def test_unknown_operation_is_acknowledged(self):
        body = json.dumps({**sample_payload(), "operation": "mystery"})
        assert post({HEADER: SECRET}, body=body).status_code == 200


class TestVerifyBuilderRequest:
    def test_defaults_to_authorization_header(self, monkeypatch):
        monkeypatch.delenv("BUILDER_IO_WEBHOOK_HEADER")
        assert verify_builder_request(Headers({"authorization": SECRET})) is True
        assert verify_builder_request(Headers({HEADER: SECRET})) is False

    def test_fails_closed_when_no_secret(self, monkeypatch):
        monkeypatch.delenv("BUILDER_IO_WEBHOOK_SECRET")
        assert verify_builder_request(Headers({HEADER: "undefined"}), header=HEADER) is False
        assert verify_builder_request(Headers({HEADER: ""}), header=HEADER, secret="") is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_builder_request(Headers({"x": "päss"}), header="x", secret="päss") is True
        assert verify_builder_request(Headers({"x": "päss"}), header="x", secret="pass") is False


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
