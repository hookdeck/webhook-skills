import json
import os

# Set test environment variables before importing the app
os.environ["TORII_WEBHOOK_HEADER"] = "Authorization"
os.environ["TORII_WEBHOOK_SECRET"] = "Bearer test_torii_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_torii_request

client = TestClient(app)

SECRET = os.environ["TORII_WEBHOOK_SECRET"]

# Illustrative bodies: Torii defines no event field; these are made-up workflow templates.
BODIES = [
    {"workflow": "new app discovered", "app": {"name": "Example App"}},
    {"workflow": "user offboarding", "user": {"email": "jane@example.com"}},
]


def send(method="POST", headers=None, body=None, content_type="application/json"):
    h = {"Content-Type": content_type, **(headers or {})}
    return client.request(method, "/webhooks/torii", headers=h, content=body)


class TestCredentialVerification:
    def test_accepts_exact_whole_value(self):
        r = send(headers={"Authorization": SECRET}, body=json.dumps(BODIES[0]))
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_header_name_case_insensitive(self):
        assert send(headers={"authorization": SECRET}, body="{}").status_code == 200

    def test_missing_header_401(self):
        assert send(body="{}").status_code == 401

    def test_wrong_value_401(self):
        assert send(headers={"Authorization": "Bearer nope"}, body="{}").status_code == 401

    def test_does_not_strip_bearer_prefix(self):
        r = send(headers={"Authorization": "test_torii_secret_0123456789"}, body="{}")
        assert r.status_code == 401

    def test_different_length_value_401(self):
        assert send(headers={"Authorization": "x"}, body="{}").status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        r = send(headers={"Authorization": b"Bearer caf\xe9"}, body="{}")
        assert r.status_code == 401

    def test_unconfigured_secret_rejects(self):
        assert verify_torii_request({"authorization": "anything"}, secret="") is False

    def test_custom_header_name(self):
        assert verify_torii_request({"x-torii-key": "abc"}, secret="abc", header_name="X-Torii-Key") is True
        assert verify_torii_request({"authorization": "abc"}, secret="abc", header_name="X-Torii-Key") is False


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_accepts_other_methods(self, method):
        r = send(method, headers={"Authorization": SECRET}, body=json.dumps(BODIES[1]))
        assert r.status_code == 200

    def test_get_with_empty_body(self):
        assert send("GET", headers={"Authorization": SECRET}).status_code == 200

    def test_post_with_empty_body(self):
        assert send("POST", headers={"Authorization": SECRET}, body="").status_code == 200

    def test_unauthenticated_get_401(self):
        assert send("GET").status_code == 401

    @pytest.mark.parametrize("body", BODIES, ids=[b["workflow"] for b in BODIES])
    def test_handles_illustrative_workflows(self, body):
        assert send(headers={"Authorization": SECRET}, body=json.dumps(body)).status_code == 200

    def test_any_content_type(self):
        r = send(headers={"Authorization": SECRET}, body=json.dumps(BODIES[0]), content_type="text/plain")
        assert r.status_code == 200

    def test_invalid_json_400_after_auth(self):
        assert send(headers={"Authorization": SECRET}, body="{not json").status_code == 400

    def test_auth_before_parse(self):
        assert send(body="{not json").status_code == 401
