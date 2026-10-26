import json
import os

# Set test environment variables before importing the app
os.environ["PLUNK_WEBHOOK_HEADER"] = "Authorization"
os.environ["PLUNK_WEBHOOK_SECRET"] = "Bearer test_plunk_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, classify_event, safe_equal, verify_plunk_request

client = TestClient(app)

SECRET = os.environ["PLUNK_WEBHOOK_SECRET"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def default_body(event=None):
    """Default body shape from the Plunk docs: {contact, workflow, execution, event}."""
    if event is None:
        event = {"bounceType": "Permanent", "bouncedAt": "2025-01-15T10:30:00.000Z"}
    return {
        "contact": {"email": "user@example.com", "subscribed": True, "data": {"name": "John"}},
        "workflow": {"id": "wf_abc123", "name": "Bounce Notifications"},
        "execution": {"id": "exec_xyz789", "startedAt": "2025-01-15T10:30:00.000Z"},
        "event": {
            "subject": "Welcome to Plunk",
            "emailId": "ac32f08e-c6b9-45d3-9824-a73dff1e3bbf",
            **event,
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(default_body())
    return client.post(
        "/webhooks/plunk",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_exact_whole_header_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({"Authorization": "test_plunk_secret_0123456789"}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_another_header_is_not_accepted(self):
        assert post({"X-Plunk-Secret": SECRET}).status_code == 401

    def test_credential_checked_before_parsing_body(self):
        assert post(body="{not json").status_code == 401


class TestVerifyHelper:
    def test_custom_header_name(self):
        assert verify_plunk_request(Headers({"x-plunk-secret": "s3cret"}), "s3cret", "X-Plunk-Secret") is True
        assert verify_plunk_request(Headers({"authorization": "s3cret"}), "s3cret", "X-Plunk-Secret") is False

    def test_defaults_to_authorization(self):
        assert verify_plunk_request(Headers({"authorization": "s3cret"}), "s3cret") is True

    def test_fails_closed_when_unconfigured(self):
        assert verify_plunk_request(Headers({"authorization": "anything"}), "") is False

    def test_non_ascii_does_not_raise(self):
        assert safe_equal("sécret", "secret") is False
        assert safe_equal("sécret", "sécret") is True


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_secret_and_empty_body(self, method):
        res = client.request(method, "/webhooks/plunk", headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_method_without_secret(self, method):
        assert client.request(method, "/webhooks/plunk").status_code == 401

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_accepts_method_with_json_body(self, method):
        res = client.request(
            method,
            "/webhooks/plunk",
            content=json.dumps(default_body()),
            headers={"Authorization": SECRET, "Content-Type": "application/json"},
        )
        assert res.status_code == 200


class TestBodies:
    @pytest.mark.parametrize(
        "event",
        [
            {"bounceType": "Permanent", "bouncedAt": "2025-01-15T10:30:00.000Z"},
            {"complainedAt": "2025-01-15T10:30:00.000Z"},
            {"link": "https://example.com", "clickedAt": "2025-01-15T11:05:00.000Z"},
            {"openedAt": "2025-01-15T11:00:00.000Z", "opens": 1},
            {"deliveredAt": "2025-01-15T10:30:05.000Z"},
            {"sentAt": "2025-01-15T10:30:00.000Z"},
            {"segmentId": "seg_abc123", "segmentName": "VIP Users"},
            {},
        ],
    )
    def test_default_body_variants(self, event):
        res = post({"Authorization": SECRET}, json.dumps(default_body(event)))
        assert res.status_code == 200

    def test_custom_body_is_plain_json(self):
        res = post({"Authorization": SECRET}, json.dumps({"email": "user@example.com", "plan": "pro"}))
        assert res.status_code == 200

    def test_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_authentication(self):
        assert post({"Authorization": SECRET}, "{not json").status_code == 400


class TestClassifyEvent:
    def test_infers_kind_from_documented_fields(self):
        assert classify_event({"bounceType": "Permanent"}) == "email.bounce"
        assert classify_event({"complainedAt": "x"}) == "email.complaint"
        assert classify_event({"segmentId": "seg_1"}) == "segment"
        assert classify_event({}) is None
        assert classify_event(None) is None


def test_health():
    assert client.get("/health").status_code == 200
