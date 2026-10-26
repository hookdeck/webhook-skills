import json
import os

# Set test environment variables before importing the app
os.environ["RAPIDAPI_WEBHOOK_SECRET"] = "test_rapidapi_secret_0123456789"
os.environ["RAPIDAPI_EVENT_FIELD"] = "eventType"  # illustrative field name

import pytest
from fastapi.testclient import TestClient

from main import app, verify_rapidapi_request

client = TestClient(app)

SECRET = os.environ["RAPIDAPI_WEBHOOK_SECRET"]
HEADER = "x-rapidapi-webhook-secret"

EVENTS = [
    "API Created", "API Updated", "API Deleted", "Subscription Created",
    "Subscription Updated", "User Created", "Billing Plan Updated",
]


def sample_payload(event="API Created"):
    # Illustrative payload: RapidAPI does not document the body format.
    return {"eventType": event, "data": {"id": "example-id"}}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/rapidapi",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretVerification:
    def test_correct_secret(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-RapidAPI-Webhook-Secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_prefix_of_secret_rejected(self):
        assert post({HEADER: SECRET[:-1]}).status_code == 401

    def test_non_ascii_secret_does_not_raise(self):
        # Header values are latin-1 on the wire; compare_digest on str would raise TypeError.
        assert verify_rapidapi_request({HEADER: "café-secret"}, SECRET) is False

    def test_missing_secret(self):
        assert post().status_code == 401

    def test_rejects_everything_when_unconfigured(self, monkeypatch):
        assert verify_rapidapi_request({HEADER: SECRET}, "") is False
        monkeypatch.delenv("RAPIDAPI_WEBHOOK_SECRET")
        assert verify_rapidapi_request({HEADER: SECRET}) is False


class TestBodyHandling:
    def test_any_content_type_accepted(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unhandled_event(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("Team Updated")))
        assert res.status_code == 200

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
