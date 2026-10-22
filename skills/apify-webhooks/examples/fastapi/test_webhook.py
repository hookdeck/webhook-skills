import json
import os

# Set test environment variables before importing the app
os.environ["APIFY_WEBHOOK_SECRET"] = "test_apify_secret_0123456789"
os.environ.pop("APIFY_WEBHOOK_HEADER", None)  # default: X-Webhook-Secret

import pytest
from fastapi.testclient import TestClient

from main import app, verify_apify_request

client = TestClient(app)

SECRET = os.environ["APIFY_WEBHOOK_SECRET"]
HEADER = "X-Webhook-Secret"

EVENTS = [
    "ACTOR.RUN.CREATED", "ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED",
    "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.RESURRECTED",
    "ACTOR.BUILD.CREATED", "ACTOR.BUILD.SUCCEEDED", "ACTOR.BUILD.FAILED",
    "ACTOR.BUILD.ABORTED", "ACTOR.BUILD.TIMED_OUT",
]


def sample_payload(event_type="ACTOR.RUN.SUCCEEDED"):
    is_build = event_type.startswith("ACTOR.BUILD")
    return {
        "userId": "abf6vtB2nvQZ4nJzo",
        "createdAt": "2019-01-09T15:59:56.408Z",
        "eventType": event_type,
        "eventData": (
            {"actorId": "fW4MyDhgwtMLrB987", "actorBuildId": "HG7ML7M8z78YcAPEB"}
            if is_build
            else {"actorId": "fW4MyDhgwtMLrB987", "actorRunId": "uPBN9qaKd2iLs5naZ"}
        ),
        "resource": {"id": "uPBN9qaKd2iLs5naZ", "status": "SUCCEEDED"},
    }


def post(headers=None, body=None, content_type="application/json", url="/webhooks/apify"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        url,
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

    def test_system_headers_are_not_credentials(self):
        res = post({"X-Apify-Webhook": SECRET, "X-Apify-Webhook-Dispatch-Id": SECRET})
        assert res.status_code == 401

    def test_secret_in_url_is_not_accepted(self):
        assert post(url=f"/webhooks/apify?token={SECRET}").status_code == 401

    def test_non_ascii_does_not_raise(self):
        assert verify_apify_request({"x-webhook-secret": "sécret-ü"}, secret=SECRET) is False
        assert verify_apify_request({"x-webhook-secret": "sécret-ü"}, secret="sécret-ü") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_apify_request({"x-webhook-secret": SECRET}, secret="") is False
        assert verify_apify_request({"x-webhook-secret": SECRET}, secret=SECRET) is True


class TestConfigurableHeaderName:
    def test_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("APIFY_WEBHOOK_HEADER", "X-Apify-Auth")
        assert post({"x-apify-auth": SECRET}).status_code == 200
        assert post({HEADER: SECRET}).status_code == 401

    def test_whole_value_is_compared_including_bearer(self, monkeypatch):
        monkeypatch.setenv("APIFY_WEBHOOK_HEADER", "Authorization")
        secret = f"Bearer {SECRET}"
        assert verify_apify_request({"authorization": secret}, secret=secret) is True
        # The prefix is not stripped: the bare token does not match "Bearer <token>"
        assert verify_apify_request({"authorization": SECRET}, secret=secret) is False
        assert verify_apify_request({"authorization": secret}, secret=SECRET) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("ACTOR.SOMETHING.NEW")))
        assert res.status_code == 200

    def test_payload_without_event_data(self):
        res = post({HEADER: SECRET}, body=json.dumps({"eventType": "ACTOR.RUN.FAILED"}))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
