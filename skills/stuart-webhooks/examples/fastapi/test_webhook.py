import json
import os

# Set test environment variables before importing the app
os.environ["STUART_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["STUART_WEBHOOK_SECRET"] = "Bearer test_stuart_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_stuart_request

client = TestClient(app)

HEADER = os.environ["STUART_WEBHOOK_HEADER"]
SECRET = os.environ["STUART_WEBHOOK_SECRET"]

TOPICS = [
    "package_created", "courier_assigned", "courier_arriving", "package_split", "courier_waiting",
    "package_delivering", "package_delivered", "package_canceled", "package_returning",
    "package_returned", "courier_reassigning", "courier_moving",
]


def sample_payload(topic="package_created"):
    return {
        "version": "v3",
        "occurred_at": "2023-02-13T15:29:36.000+01:00",
        "event_id": "93ce4c52-5b27-4cec-9baf-68cfcdd4da46",
        "webhook_id": 2359,
        "topic": topic,
        "details": {
            "account": {"id": 451871},
            "package": {"id": "10000000001", "reference": "1676298576"},
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/stuart",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_is_compared_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header_is_ignored(self):
        assert post({"X-Other": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_stuart_request({"x-webhook-secret": "café"}, HEADER, SECRET) is False
        assert verify_stuart_request({"x-webhook-secret": "café"}, HEADER, "café") is True

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"x-webhook-secret": SECRET}
        assert verify_stuart_request(headers, HEADER, secret="") is False
        assert verify_stuart_request(headers, HEADER, secret=SECRET) is True

    def test_custom_header_name(self):
        assert verify_stuart_request({"x-stuart-auth": "k"}, "X-Stuart-Auth", "k") is True
        assert verify_stuart_request({"x-stuart-auth": "k"}, "X-Webhook-Secret", "k") is False


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
    @pytest.mark.parametrize("topic", TOPICS)
    def test_handles_topic(self, topic, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(topic)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_topic_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200

    def test_payload_without_details(self):
        res = post({HEADER: SECRET}, body=json.dumps({"topic": "package_created"}))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
