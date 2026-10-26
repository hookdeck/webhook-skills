import json
import os

# Set test environment variables before importing the app
os.environ["ORY_WEBHOOK_HEADER"] = "X-Ory-Webhook-Key"
os.environ["ORY_WEBHOOK_SECRET"] = "Bearer test_ory_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_ory_request

client = TestClient(app)

HEADER = os.environ["ORY_WEBHOOK_HEADER"]
SECRET = os.environ["ORY_WEBHOOK_SECRET"]

EVENTS = [
    "registration.after", "login.after", "settings.after", "verification.after", "recovery.after",
]


def sample_payload(event="registration.after"):
    """Mirrors the illustrative Jsonnet template: function(ctx) { event: 'registration.after', identity: ctx.identity }"""
    return {
        "event": event,
        "identity": {"id": "3a5293f1-f4d6-49f4-b34f-6da62c360604", "traits": {"email": "user@example.com"}},
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/ory",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_exact_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={HEADER.lower(): SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert send(headers={HEADER: "test_ory_secret_0123456789"}).status_code == 401

    def test_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert send().status_code == 401

    def test_secret_in_other_header_is_ignored(self):
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_non_ascii_credential_does_not_raise(self):
        assert verify_ory_request({HEADER: "séc€ret"}, secret=SECRET, header_name=HEADER) is False
        assert verify_ory_request({HEADER: "séc€ret"}, secret="séc€ret", header_name=HEADER) is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_ory_request({HEADER: SECRET}, secret="", header_name=HEADER) is False
        assert verify_ory_request({HEADER: SECRET}, secret=SECRET, header_name=HEADER) is True

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("ORY_WEBHOOK_HEADER")
        assert verify_ory_request({"Authorization": SECRET}, secret=SECRET) is True


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_body_methods(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    def test_get_without_body(self):
        res = client.get("/webhooks/ory", headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_requires_credential(self):
        assert client.get("/webhooks/ory").status_code == 401

    def test_delete_not_allowed(self):
        assert client.delete("/webhooks/ory", headers={HEADER: SECRET}).status_code == 405


class TestBodyHandling:
    def test_any_content_type(self):
        assert send(headers={HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_empty_body(self):
        assert send(headers={HEADER: SECRET}, body="").status_code == 200

    def test_invalid_json(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert send(headers={HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert send(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload("something.new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
