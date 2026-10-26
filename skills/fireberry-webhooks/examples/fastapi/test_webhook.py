import json
import os

# The secret is the whole header value, including the "Bearer " prefix the user typed.
SECRET = "Bearer test_fireberry_secret_0123456789"

# Set test environment variables before importing the app
os.environ["FIREBERRY_WEBHOOK_SECRET"] = SECRET
os.environ.pop("FIREBERRY_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_fireberry_request

client = TestClient(app)

AUTH = {"Authorization": SECRET}


# Illustrative body: Fireberry adds no event field, the automation's author writes the body.
def sample_payload(event="account.created"):
    return {"event": event, "record": {"id": "a1b2c3", "accountname": "Acme Ltd", "statuscode": "Lead"}}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/fireberry",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_exact_value_on_default_header(self):
        res = send(headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={"authorization": SECRET}).status_code == 200

    def test_whole_value_is_compared_bare_secret_rejected(self):
        assert send(headers={"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert send(headers={"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send(headers={"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert send().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest raises on non-ASCII str; the code encodes both sides to bytes
        assert verify_fireberry_request(Headers({"authorization": "Bearer pässword"}), secret=SECRET) is False
        assert verify_fireberry_request(Headers({"authorization": "Bearer pässword"}), secret="Bearer pässword") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_fireberry_request(Headers({"authorization": SECRET}), secret="") is False
        assert verify_fireberry_request(Headers({"authorization": SECRET}), secret=SECRET) is True

    def test_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("FIREBERRY_WEBHOOK_HEADER", "X-Fireberry-Secret")
        assert send(headers={"x-fireberry-secret": SECRET}).status_code == 200
        assert send(headers=AUTH).status_code == 401


class TestRequestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_methods_with_json_body(self, method):
        assert send(method, headers=AUTH).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_methods_with_empty_body(self, method):
        res = send(method, headers=AUTH, body="")
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_still_requires_secret(self):
        assert send("GET", body="").status_code == 401


class TestBodyHandling:
    def test_any_content_type(self):
        assert send(headers=AUTH, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert send(headers=AUTH, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert send(headers=AUTH, body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert send(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", ["account.created", "record.updated"])
    def test_handles_event(self, event, capsys):
        res = send(headers=AUTH, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = send(headers=AUTH, body=json.dumps(sample_payload("something.else")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
