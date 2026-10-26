import json
import os

# Set test environment variables before importing the app
os.environ["PARTICLE_WEBHOOK_SECRET"] = "Bearer test_particle_secret_0123456789"
os.environ.pop("PARTICLE_WEBHOOK_HEADER", None)

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_particle_request

client = TestClient(app)

SECRET = os.environ["PARTICLE_WEBHOOK_SECRET"]
FORM = "event=temperature&data=21.5&published_at=2017-02-01T21%3A08%3A05.763Z&coreid=3f002b000000000000000000"
JSON_BODY = json.dumps(
    {
        "event": "motion-detected",
        "data": "1",
        "published_at": "2017-02-01T21:08:05.763Z",
        "coreid": "3f002b000000000000000000",
    }
)
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


@pytest.fixture(autouse=True)
def reset_env():
    yield
    os.environ.pop("PARTICLE_WEBHOOK_HEADER", None)
    os.environ["PARTICLE_WEBHOOK_SECRET"] = SECRET


def send(method="POST", headers=None, body=None, content_type="application/x-www-form-urlencoded", query=""):
    h = dict(headers or {})
    kwargs = {}
    if body is not None:
        h["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, f"/webhooks/particle{query}", headers=h, **kwargs)


class TestHeaderAuthentication:
    def test_accepts_correct_value_default_authorization_header(self):
        res = send(headers={"Authorization": SECRET}, body=FORM)
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "temperature"}

    def test_compares_whole_value_bare_token_rejected(self):
        res = send(headers={"Authorization": SECRET.replace("Bearer ", "")}, body=FORM)
        assert res.status_code == 401

    def test_rejects_wrong_value_same_length(self):
        res = send(headers={"Authorization": "x" * len(SECRET)}, body=FORM)
        assert res.status_code == 401

    def test_rejects_value_of_different_length(self):
        res = send(headers={"Authorization": "short"}, body=FORM)
        assert res.status_code == 401

    def test_rejects_missing_header(self):
        assert send(body=FORM).status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        os.environ.pop("PARTICLE_WEBHOOK_SECRET")
        assert send(headers={"Authorization": "anything"}, body=FORM).status_code == 401

    def test_custom_header_name_case_insensitive(self):
        os.environ["PARTICLE_WEBHOOK_HEADER"] = "X-Particle-Token"
        os.environ["PARTICLE_WEBHOOK_SECRET"] = "abc123-static-secret"
        assert send(headers={"x-particle-token": "abc123-static-secret"}, body=FORM).status_code == 200
        assert send(headers={"Authorization": "abc123-static-secret"}, body=FORM).status_code == 401

    def test_body_not_parsed_when_auth_fails(self):
        res = send(body="{not json", content_type="application/json")
        assert res.status_code == 401

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_particle_request({"authorization": "café"}, secret="café") is False
        assert verify_particle_request(Headers({"authorization": "Bearer a"}), secret="Bearer a") is True


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_valid_header(self, method):
        res = send(method, {"Authorization": SECRET}, query="?event=temperature&data=20")
        assert res.status_code == 200
        assert res.json()["event"] == "temperature"

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_header_first(self, method):
        assert send(method, query="?event=temperature").status_code == 401


class TestBodyParsing:
    def test_form_body(self):
        res = send(headers={"Authorization": SECRET}, body=FORM)
        assert res.json()["event"] == "temperature"

    def test_json_body(self):
        res = send("PUT", {"Authorization": SECRET}, JSON_BODY, "application/json")
        assert res.status_code == 200
        assert res.json()["event"] == "motion-detected"

    def test_query_string_on_get(self):
        res = send("GET", {"Authorization": SECRET}, query="?event=motion-detected&coreid=abc")
        assert res.json()["event"] == "motion-detected"

    def test_empty_body(self):
        res = send("DELETE", {"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json()["event"] == "unhandled"

    def test_json_under_unusual_content_type(self):
        res = send("POST", {"Authorization": SECRET}, JSON_BODY, "text/plain")
        assert res.json()["event"] == "motion-detected"

    def test_malformed_json_returns_400_after_auth(self):
        res = send("POST", {"Authorization": SECRET}, "{not json", "application/json")
        assert res.status_code == 400

    def test_json_array_returns_400(self):
        res = send("POST", {"Authorization": SECRET}, "[1,2]", "application/json")
        assert res.status_code == 400

    def test_unknown_event_acknowledged(self):
        res = send("PATCH", {"Authorization": SECRET}, "event=something-else&data=1")
        assert res.status_code == 200
        assert res.json()["event"] == "unhandled"


def test_health():
    assert client.get("/health").status_code == 200
