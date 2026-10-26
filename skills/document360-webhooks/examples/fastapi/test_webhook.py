import json
import os

# Set test environment variables before importing the app
os.environ["DOCUMENT360_WEBHOOK_HEADER"] = "X-Docs-Secret"
os.environ["DOCUMENT360_WEBHOOK_SECRET"] = "Bearer test_document360_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_document360_request

client = TestClient(app)

HEADER = os.environ["DOCUMENT360_WEBHOOK_HEADER"]
SECRET = os.environ["DOCUMENT360_WEBHOOK_SECRET"]

EVENTS = [
    "Article published", "Article created", "Article deleted", "Article settings saved",
    "Article workflow status updated", "Extension token deleted",
]


def sample_payload(event="Article published"):
    return {
        "Knowledge base name": "Document360 2.0",
        "Event": event,
        "User": "Matt Sterling",
        "User email": "matt.sterling@document360.co",
        "Logged on (UTC)": "09/12/2025 06:15:00",
        "Article name": "Getting Started",
        "Article id": "e1444f0x-0xx0-000x-xxx0-0x3f2bc3713c",
        "Language": "English",
        "Language code": "en",
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    hdrs = dict(headers or {})
    if content_type:
        hdrs["Content-Type"] = content_type
    return client.request(method, "/webhooks/document360", content=content, headers=hdrs)


class TestCredentialVerification:
    def test_correct_value_post(self):
        res = send("POST", {HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_correct_value_put(self):
        assert send("PUT", {HEADER: SECRET}).status_code == 200

    def test_header_name_is_case_insensitive(self):
        assert send("POST", {"x-docs-secret": SECRET}).status_code == 200

    def test_whole_value_is_compared_prefix_included(self):
        assert send("POST", {HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert send("POST", {HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_length_does_not_raise(self):
        assert send("POST", {HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert send("POST").status_code == 401

    def test_credential_under_other_header_name(self):
        assert send("POST", {"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; we encode to bytes first.
        res = client.post(
            "/webhooks/document360",
            content=json.dumps(sample_payload()),
            headers={HEADER.encode(): "séçrét".encode("utf-8"), b"Content-Type": b"application/json"},
        )
        assert res.status_code == 401

    def test_authenticates_before_parsing_body(self):
        assert send("POST", body="not json").status_code == 401


class TestVerifyFunction:
    def test_fails_closed_when_unconfigured(self):
        assert verify_document360_request({HEADER: "anything"}, secret="", header_name=HEADER) is False

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("DOCUMENT360_WEBHOOK_HEADER")
        assert verify_document360_request(Headers({"Authorization": SECRET}), secret=SECRET) is True
        assert verify_document360_request(Headers({HEADER: SECRET}), secret=SECRET) is False


class TestRequestHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_known_events(self, event):
        res = send("POST", {HEADER: SECRET}, json.dumps(sample_payload(event)))
        assert res.status_code == 200

    def test_unknown_event(self):
        res = send("POST", {HEADER: SECRET}, json.dumps(sample_payload("Something new")))
        assert res.status_code == 200

    def test_article_deleted_with_slugs(self):
        body = json.dumps({**sample_payload("Article deleted"), "Slugs": [{"language": "en", "slug": "getting-started"}]})
        assert send("POST", {HEADER: SECRET}, body).status_code == 200

    def test_any_content_type(self):
        assert send("POST", {HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_empty_body_when_authenticated(self):
        assert send("POST", {HEADER: SECRET}, body="", content_type=None).status_code == 200

    def test_invalid_json(self):
        assert send("POST", {HEADER: SECRET}, "not json").status_code == 400

    def test_non_object_body(self):
        assert send("POST", {HEADER: SECRET}, "[1,2]").status_code == 400

    def test_get_not_allowed(self):
        assert client.get("/webhooks/document360", headers={HEADER: SECRET}).status_code == 405
