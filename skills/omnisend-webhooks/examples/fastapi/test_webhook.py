import json
import os

import pytest

os.environ["OMNISEND_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["OMNISEND_WEBHOOK_SECRET"] = "test_omnisend_secret_0123456789"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_omnisend_request  # noqa: E402

SECRET = os.environ["OMNISEND_WEBHOOK_SECRET"]
client = TestClient(app)


def sample_payload(event="subscribed"):
    return {"contactEmail": "jane@example.com", "contactName": "Jane", "event": event}


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    return client.post(
        "/webhooks/omnisend",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSharedSecretHeader:
    def test_accepts_correct_secret(self):
        res = post(headers={"X-Webhook-Secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post(headers={"x-webhook-secret": SECRET}).status_code == 200

    def test_rejects_wrong_secret_same_length(self):
        assert post(headers={"X-Webhook-Secret": "x" * len(SECRET)}).status_code == 401

    def test_rejects_different_length(self):
        assert post(headers={"X-Webhook-Secret": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_omnisend_request({"x-webhook-secret": "sécret-ünïcode"}) is False

    def test_does_not_strip_bearer_prefix(self):
        assert post(headers={"X-Webhook-Secret": f"Bearer {SECRET}"}).status_code == 401


class TestVerifyFunction:
    def test_bearer_style_value_exact(self):
        kwargs = {"header_name": "Authorization", "secret": "Bearer abc123"}
        assert verify_omnisend_request({"authorization": "Bearer abc123"}, **kwargs) is True
        assert verify_omnisend_request({"authorization": "abc123"}, **kwargs) is False

    def test_custom_header_name(self):
        kwargs = {"header_name": "X-Omnisend-Key", "secret": "s3cret"}
        assert verify_omnisend_request({"x-omnisend-key": "s3cret"}, **kwargs) is True
        assert verify_omnisend_request({"x-webhook-secret": "s3cret"}, **kwargs) is False

    def test_fails_closed_without_secret(self):
        assert verify_omnisend_request({"x-webhook-secret": "x"}, secret="") is False


class TestRequestHandling:
    @pytest.mark.parametrize("event", ["subscribed", "placed order", "something custom"])
    def test_handles_events(self, event):
        res = post(json.dumps(sample_payload(event)), {"X-Webhook-Secret": SECRET})
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        res = post(headers={"X-Webhook-Secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_checks_secret_before_parsing(self):
        assert post("not json", {"X-Webhook-Secret": "wrong"}).status_code == 401

    def test_invalid_json_is_400(self):
        assert post("not json", {"X-Webhook-Secret": SECRET}).status_code == 400

    def test_non_object_is_400(self):
        assert post("[1,2]", {"X-Webhook-Secret": SECRET}).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
