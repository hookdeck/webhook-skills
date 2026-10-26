import json
import os

# Set test environment variables before importing the app
os.environ["FIRSTBASE_WEBHOOK_HEADER"] = "X-Firstbase-Key"
os.environ["FIRSTBASE_WEBHOOK_SECRET"] = "Bearer test_firstbase_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_firstbase_request

client = TestClient(app)

HEADER = os.environ["FIRSTBASE_WEBHOOK_HEADER"]
SECRET = os.environ["FIRSTBASE_WEBHOOK_SECRET"]

EVENT_TYPES = ["CREATED", "UPDATED", "DELETED"]


def sample_payload(event_type="CREATED"):
    return {"eventType": event_type, "id": "ord_12345"}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/firstbase",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderVerification:
    def test_exact_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_different_header_name(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        res = client.post(
            "/webhooks/firstbase",
            content=json.dumps(sample_payload()),
            headers=[
                (b"content-type", b"application/json"),
                (HEADER.lower().encode(), "é-secret".encode("utf-8")),
            ],
        )
        assert res.status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_firstbase_request({HEADER: SECRET}, HEADER, "") is False

    def test_default_header_name_is_authorization(self, monkeypatch):
        monkeypatch.delenv("FIRSTBASE_WEBHOOK_HEADER")
        assert verify_firstbase_request({"Authorization": SECRET}) is True
        assert verify_firstbase_request({HEADER: SECRET}) is False


class TestBodyHandling:
    @pytest.mark.parametrize("event_type", EVENT_TYPES)
    def test_handles_event_types(self, event_type):
        res = post({HEADER: SECRET}, json.dumps(sample_payload(event_type)))
        assert res.status_code == 200

    def test_unknown_event_type(self):
        res = post({HEADER: SECRET}, json.dumps(sample_payload("ARCHIVED")))
        assert res.status_code == 200

    def test_any_content_type(self):
        res = post({HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, "not json").status_code == 400

    def test_non_object_body(self):
        assert post({HEADER: SECRET}, "[1,2]").status_code == 400

    def test_authenticates_before_parsing(self):
        assert post(None, "not json").status_code == 401
