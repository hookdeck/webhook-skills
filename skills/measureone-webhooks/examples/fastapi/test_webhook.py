import json
import os

# Set test environment variables before importing the app
os.environ["MEASUREONE_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["MEASUREONE_WEBHOOK_SECRET"] = "Bearer test_measureone_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_measureone_request

client = TestClient(app)

HEADER = os.environ["MEASUREONE_WEBHOOK_HEADER"]
SECRET = os.environ["MEASUREONE_WEBHOOK_SECRET"]

EVENTS = [
    "datarequest.report_available", "datarequest.report_complete", "datarequest.report_update_available",
    "datarequest.report_error", "datarequest.items_available", "datarequest.items_processed",
    "datarequest.no_items", "datarequest.updates_available", "datarequest.acquisition_completed",
    "datarequest.refresh_failed", "datasource.connected", "transaction.processed",
    "unprocessable.entity", "session.completed", "session.rejected", "session.terminated",
    "session.no_login", "item.created", "item.processed", "item.unavailable", "individual.purged",
]


def sample_payload(event="datarequest.items_available"):
    return {
        "event": event,
        "datarequest_id": "dr_01",
        "individual_id": "ind_01",
        "external_id": "ext_01",
        "metadata": {},
        "is_refresh": False,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/measureone",
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

    def test_whole_value_compared_bearer_not_stripped(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_other_headers_ignored(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_default_header_is_authorization(self):
        headers = Headers({"authorization": "abc"})  # case-insensitive, like request.headers
        assert verify_measureone_request(headers, "abc", "Authorization") is True
        assert verify_measureone_request(headers, "abd", "Authorization") is False

    def test_rejects_when_unconfigured(self):
        assert verify_measureone_request({HEADER.lower(): "x"}, "", HEADER) is False

    def test_non_ascii_value_does_not_raise(self):
        assert verify_measureone_request(Headers({HEADER.lower(): "p\u00e4ssword".encode("latin-1").decode("latin-1")}), "password", HEADER) is False

    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401


class TestBodyHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event):
        assert post({HEADER: SECRET}, json.dumps(sample_payload(event))).status_code == 200

    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_unknown_event(self):
        assert post({HEADER: SECRET}, json.dumps(sample_payload("something.new"))).status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, "not json").status_code == 400

    def test_non_object(self):
        assert post({HEADER: SECRET}, "[1,2]").status_code == 400
