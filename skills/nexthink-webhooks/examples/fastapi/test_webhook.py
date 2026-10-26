import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 7f3c9a1e-5b2d-4e68-8a40-d1c2b3a49586"
os.environ["NEXTHINK_AUTHORIZATION"] = AUTH

import pytest
from fastapi.testclient import TestClient

from main import app, verify_nexthink_request

client = TestClient(app)

# Illustrative template: Nexthink adds no event field; "event" is chosen by the template author
TRIGGERED = {"event": "alert triggered", "monitor": "High CPU (illustrative)"}
RECOVERED = {"event": "alert recovered", "monitor": "High CPU (illustrative)"}


def send(method="POST", body=None, headers=None, content_type="application/json"):
    content = json.dumps(TRIGGERED) if body is None else body
    return client.request(
        method,
        "/webhooks/nexthink",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestNexthinkWebhook:
    def test_accepts_full_authorization_header(self):
        res = send(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_post_put_patch(self, method):
        res = send(method, json.dumps(RECOVERED), {"Authorization": AUTH})
        assert res.status_code == 200

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_wrong_token(self):
        assert send(headers={"Authorization": "Bearer wrong-token"}).status_code == 401

    def test_rejects_token_without_prefix(self):
        res = send(headers={"Authorization": AUTH.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_bad_credentials_on_put_and_patch(self):
        assert send("PUT", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert send("PATCH").status_code == 401

    def test_non_ascii_header_is_rejected_not_an_error(self):
        res = send(headers={"Authorization": "Bearer café".encode("utf-8")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = send(body=json.dumps(TRIGGERED), headers={"Authorization": AUTH}, content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_empty_body(self):
        assert send(body="", headers={"Authorization": AUTH}).status_code == 200

    def test_invalid_json_returns_400(self):
        assert send(body="not json", headers={"Authorization": AUTH}).status_code == 400

    def test_accepts_unrecognised_payload(self):
        assert send(body=json.dumps({"foo": "bar"}), headers={"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_nexthink_request({"authorization": "Bearer x"}, {}) is False
        assert verify_nexthink_request({"authorization": ""}, {"NEXTHINK_AUTHORIZATION": ""}) is False
