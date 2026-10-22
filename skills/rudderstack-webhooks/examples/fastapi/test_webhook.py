import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "rudder-user"
PASSWORD = "p@ss:word/with:colons"
os.environ["RUDDERSTACK_WEBHOOK_USERNAME"] = USERNAME
os.environ["RUDDERSTACK_WEBHOOK_PASSWORD"] = PASSWORD

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_rudderstack_request

client = TestClient(app)


def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode()).decode()


GOOD = basic(USERNAME, PASSWORD)
TRACK = {"type": "track", "event": "Order Completed", "userId": "u1", "properties": {"total": 10}}
IDENTIFY = {"type": "identify", "userId": "u1", "traits": {"email": "a@example.com"}}


def send(method="POST", body=None, auth=GOOD, content_type="application/json"):
    headers = {}
    if auth:
        headers["Authorization"] = auth
    if body is not None:
        headers["Content-Type"] = content_type
    content = body if isinstance(body, (str, bytes)) or body is None else json.dumps(body)
    return client.request(method, "/webhooks/rudderstack", content=content, headers=headers)


class TestRudderstackWebhook:
    def test_accepts_track(self):
        res = send(body=TRACK)
        assert res.status_code == 200
        assert res.json() == {"received": True, "events": 1}

    def test_accepts_identify(self):
        assert send(body=IDENTIFY).status_code == 200

    def test_accepts_lowercase_scheme_and_non_json_content_type(self):
        res = send(body=TRACK, auth=basic(USERNAME, PASSWORD, "basic"), content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_batched_array(self):
        res = send(body=[TRACK, IDENTIFY])
        assert res.status_code == 200
        assert res.json()["events"] == 2

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_accepts_other_methods(self, method):
        assert send(method, body=TRACK).status_code == 200

    def test_accepts_get_with_empty_body(self):
        res = send("GET")
        assert res.status_code == 200
        assert res.json()["events"] == 0

    def test_rejects_missing_authorization(self):
        assert send(body=TRACK, auth=None).status_code == 401

    @pytest.mark.parametrize(
        "value",
        [basic(USERNAME, "nope"), basic("other", PASSWORD), basic(PASSWORD, USERNAME)],
    )
    def test_rejects_wrong_credentials(self, value):
        assert send(body=TRACK, auth=value).status_code == 401

    @pytest.mark.parametrize(
        "value",
        [
            "Bearer " + base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode(),
            "Basic",
            "Basic !!!not-base64!!!",
            "Basic " + base64.b64encode(b"no-colon-here").decode(),
        ],
    )
    def test_rejects_malformed_header(self, value):
        assert send(body=TRACK, auth=value).status_code == 401

    def test_rejects_get_without_credentials(self):
        assert send("GET", auth=None).status_code == 401

    def test_invalid_json_returns_400(self):
        assert send(body="{not json").status_code == 400

    def test_json_scalar_returns_400(self):
        assert send(body="42").status_code == 400


class TestVerify:
    def test_fails_closed_when_unconfigured(self):
        assert verify_rudderstack_request({"authorization": GOOD}, {}) is False
        assert (
            verify_rudderstack_request(
                {"authorization": GOOD}, {"RUDDERSTACK_WEBHOOK_USERNAME": USERNAME}
            )
            is False
        )

    def test_non_ascii_credentials(self):
        config = {"RUDDERSTACK_WEBHOOK_USERNAME": "üser", "RUDDERSTACK_WEBHOOK_PASSWORD": "pässwörd"}
        assert verify_rudderstack_request({"authorization": basic("üser", "pässwörd")}, config) is True
        assert verify_rudderstack_request({"authorization": basic("user", "pässwörd")}, config) is False

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c:d")) == ("a", "b:c:d")
