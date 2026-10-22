import json
import os

# Set test environment variables before importing the app
os.environ["NORTHFLANK_WEBHOOK_SECRET"] = "test_northflank_secret_0123456789"

from fastapi.testclient import TestClient

from main import app, verify_northflank_request

client = TestClient(app)

SECRET = os.environ["NORTHFLANK_WEBHOOK_SECRET"]
HEADER = "X-Northflank-Notification-Integration-Token"


def sample_payload(event="build:start"):
    """Shape from Northflank's docs for a build:start notification."""
    return {
        "event": event,
        "data": {
            "build": {
                "id": "social-hour-1312",
                "branch": "master",
                "pullRequestId": None,
                "status": "STARTING",
                "sha": "ca624abed0d5ba0ad6e6fe28c396196b81f0200d",
                "concluded": False,
                "createdAt": "2022-01-19T09:04:40.916Z",
            },
            "service": {"id": "website", "name": "Website"},
            "project": {"id": "personal-blog", "name": "Personal Blog"},
            "user": {"id": "thomas"},
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/northflank",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestTokenVerification:
    def test_correct_token(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_token(self):
        assert post().status_code == 401


class TestRequestHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2,3]").status_code == 400

    def test_every_example_event_and_unknown_events(self):
        events = [
            "build:start",
            "build:success",
            "build:failure",
            "service:deployment:status-update",
            "job-run:failure",
            "addon-backup:success",
            "addon-backup:failure",
            "billing:invoice-payment-failed",
            "something:else",
        ]
        for event in events:
            body = json.dumps({"event": event, "data": {}})
            assert post({HEADER: SECRET}, body=body).status_code == 200


class TestVerifyNorthflankRequest:
    def test_rejects_everything_when_no_secret_configured(self):
        assert verify_northflank_request({HEADER: ""}, {}) is False
        assert verify_northflank_request({}, {}) is False


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
