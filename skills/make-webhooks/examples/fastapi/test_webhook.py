import json
import os

# Set test environment variables before importing the app
os.environ["MAKE_WEBHOOK_SECRET"] = "Bearer test_make_shared_secret_0123456789"
os.environ["MAKE_WEBHOOK_HEADER"] = "Authorization"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_make_request

client = TestClient(app)

SECRET = os.environ["MAKE_WEBHOOK_SECRET"]


def sample_payload(event="order.created"):
    """What a Make HTTP > Make a request module would send with application/json."""
    return {
        "event": event,
        "id": "bundle_1042",
        "data": {"order_id": "ord_123", "email": "jane@example.com", "scenario_name": "Orders sync"},
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    hdrs = dict(headers or {})
    if method == "GET":
        return client.request(method, "/webhooks/make", headers=hdrs)
    content = body if body is not None else json.dumps(sample_payload())
    hdrs["content-type"] = content_type
    return client.request(method, "/webhooks/make", content=content, headers=hdrs)


class TestApiKeyHeader:
    def test_accepts_the_exact_header_value(self):
        res = send(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_the_header_name_case_insensitively(self):
        assert send(headers={"authorization": SECRET}).status_code == 200

    def test_compares_the_whole_value(self):
        bare = SECRET.removeprefix("Bearer ")
        assert send(headers={"Authorization": bare}).status_code == 401

    def test_rejects_a_wrong_value_of_the_same_length(self):
        assert send(headers={"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_a_value_of_a_different_length(self):
        assert send(headers={"Authorization": "short"}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest raises TypeError on non-ASCII str; the handler compares bytes.
        assert verify_make_request({"Authorization": "sécret-ünïcode"}, {"MAKE_WEBHOOK_SECRET": SECRET}) is False
        assert verify_make_request({"Authorization": "sécret"}, {"MAKE_WEBHOOK_SECRET": "sécret"}) is True

    def test_returns_401_when_the_header_is_missing(self):
        assert send().status_code == 401


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_methods_with_a_json_body(self, method):
        assert send(method, headers={"Authorization": SECRET}).status_code == 200

    def test_accepts_get_with_no_body(self):
        assert send("GET", headers={"Authorization": SECRET}).status_code == 200

    def test_rejects_an_unauthenticated_get(self):
        assert send("GET").status_code == 401

    def test_accepts_a_json_body_with_a_non_json_content_type(self):
        res = send(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_an_empty_post_body(self):
        assert send(headers={"Authorization": SECRET}, body="").status_code == 200


class TestRequestHandling:
    def test_returns_400_for_an_invalid_json_body(self):
        assert send(headers={"Authorization": SECRET}, body="{not json").status_code == 400

    def test_returns_400_for_a_non_object_json_body(self):
        assert send(headers={"Authorization": SECRET}, body="[1,2,3]").status_code == 400

    def test_does_not_parse_the_body_before_authenticating(self):
        assert send(body="{not json").status_code == 401

    @pytest.mark.parametrize(
        "event",
        ["order.created", "lead.created", "scenario.completed", "scenario.failed", "something.else"],
    )
    def test_handles_every_example_event_and_unknown_events(self, event):
        res = send(headers={"Authorization": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200


class TestVerifyMakeRequest:
    def test_rejects_everything_when_no_secret_is_configured(self):
        assert verify_make_request({"authorization": ""}, {}) is False
        assert verify_make_request({}, {}) is False

    def test_uses_a_custom_header_name(self):
        config = {"MAKE_WEBHOOK_SECRET": "s3cret", "MAKE_WEBHOOK_HEADER": "X-Make-Key"}
        assert verify_make_request({"x-make-key": "s3cret"}, config) is True
        assert verify_make_request({"authorization": "s3cret"}, config) is False

    def test_defaults_the_header_name_to_authorization(self):
        assert verify_make_request({"Authorization": "s3cret"}, {"MAKE_WEBHOOK_SECRET": "s3cret"}) is True


class TestHealth:
    def test_returns_ok(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
