import json
import os

# Set test environment variables before importing the app
os.environ["COPPER_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["COPPER_WEBHOOK_SECRET"] = "test_copper_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import EVENTS, TYPES, app, verify_copper_request

client = TestClient(app)

SECRET = os.environ["COPPER_WEBHOOK_SECRET"]
HEADER = "X-Webhook-Secret"


@pytest.fixture(autouse=True)
def restore_env():
    yield
    os.environ["COPPER_WEBHOOK_HEADER"] = HEADER
    os.environ["COPPER_WEBHOOK_SECRET"] = SECRET


def sample_payload(kind="person", event="update"):
    return {
        "ids": [12345, 12346],
        "type": kind,
        "event": event,
        "subscription_id": 987,
        "updated_attributes": {"title": ["Engineer", "Senior Engineer"]},
        "timestamp": "2021-12-13T19:18:22.084Z",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/copper",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_secret(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-webhook-secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_body_is_not_accepted(self):
        body = json.dumps({**sample_payload(), "secret": SECRET})
        assert post(body=body).status_code == 401

    def test_compares_whole_value_including_bearer_prefix(self):
        os.environ["COPPER_WEBHOOK_SECRET"] = f"Bearer {SECRET}"
        assert post({HEADER: f"Bearer {SECRET}"}).status_code == 200
        assert post({HEADER: SECRET}).status_code == 401

    def test_header_name_comes_from_env(self):
        os.environ["COPPER_WEBHOOK_HEADER"] = "Authorization"
        assert post({"Authorization": SECRET}).status_code == 200
        assert post({HEADER: SECRET}).status_code == 401

    def test_non_ascii_secret_does_not_raise(self):
        os.environ["COPPER_WEBHOOK_SECRET"] = "sécret-ü"
        assert verify_copper_request({HEADER: "sécret-ü"}) is True
        assert verify_copper_request({HEADER: "secret-u"}) is False

    def test_rejects_everything_when_secret_unset(self):
        assert verify_copper_request({HEADER: SECRET}, "") is False
        del os.environ["COPPER_WEBHOOK_SECRET"]
        assert verify_copper_request({HEADER: SECRET}) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_missing_fields_returns_400(self):
        assert post({HEADER: SECRET}, body='{"foo": 1}').status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("kind", TYPES)
    @pytest.mark.parametrize("event", EVENTS)
    def test_known_events(self, kind, event, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(kind, event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_type_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("widget", "new")))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
