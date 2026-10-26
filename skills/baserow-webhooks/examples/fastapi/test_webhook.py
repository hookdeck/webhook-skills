import json
import os

# Set test environment variables before importing the app
os.environ["BASEROW_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["BASEROW_WEBHOOK_SECRET"] = "Bearer test_baserow_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_baserow_request

client = TestClient(app)

HEADER = os.environ["BASEROW_WEBHOOK_HEADER"]
SECRET = os.environ["BASEROW_WEBHOOK_SECRET"]

EVENTS = [
    "rows.created", "rows.updated", "rows.deleted",
    "view.created", "view.updated", "view.deleted",
    "field.created", "field.updated", "field.deleted",
]

METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]


def sample_payload(event_type="rows.created"):
    return {
        "table_id": 50000,
        "database_id": 1000,
        "workspace_id": 300,
        "event_id": "00000000-0000-0000-0000-000000000000",
        "event_type": event_type,
        "items": [{"id": 1, "order": "1.00000000000000000000", "field_1": "Hello"}],
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/baserow",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_the_correct_whole_header_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_the_header_name_case_insensitively(self):
        res = send(headers={HEADER.upper(): SECRET})
        assert res.status_code == 200

    def test_does_not_strip_a_bearer_prefix(self):
        res = send(headers={HEADER: SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_a_wrong_value_of_the_same_length(self):
        res = send(headers={HEADER: "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_a_value_of_a_different_length(self):
        res = send(headers={HEADER: "short"})
        assert res.status_code == 401

    def test_rejects_a_missing_header(self):
        assert send().status_code == 401

    def test_rejects_the_secret_under_a_different_header_name(self):
        assert send(headers={"X-Other": SECRET}).status_code == 401

    def test_rejects_before_parsing_the_body(self):
        assert send(body="not json").status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        # Header values arrive as latin-1 bytes; compare_digest on a str would raise TypeError.
        res = send(headers={HEADER: "sécrét".encode("utf-8")})
        assert res.status_code == 401

    def test_rejects_every_request_when_no_secret_is_configured(self):
        headers = {HEADER.lower(): SECRET}
        assert verify_baserow_request(headers, HEADER, "") is False
        saved = os.environ.pop("BASEROW_WEBHOOK_SECRET")
        try:
            assert verify_baserow_request(headers, HEADER) is False
        finally:
            os.environ["BASEROW_WEBHOOK_SECRET"] = saved

    def test_defaults_the_header_name_to_authorization(self):
        saved = os.environ.pop("BASEROW_WEBHOOK_HEADER")
        try:
            assert verify_baserow_request({"authorization": SECRET}) is True
        finally:
            os.environ["BASEROW_WEBHOOK_HEADER"] = saved


class TestHttpMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_header(self, method):
        res = send(method, headers={HEADER: SECRET})
        assert res.status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_method_without_header(self, method):
        assert send(method).status_code == 401


class TestBodyHandling:
    def test_accepts_an_empty_body(self):
        res = send("GET", headers={HEADER: SECRET}, body="")
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_a_non_json_content_type(self):
        res = send(headers={HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_invalid_json_with_400(self):
        assert send(headers={HEADER: SECRET}, body="not json").status_code == 400

    def test_rejects_a_json_array_with_400(self):
        assert send(headers={HEADER: SECRET}, body="[1,2]").status_code == 400


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200

    def test_returns_200_for_an_unknown_event_type(self):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload("something.else")))
        assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
