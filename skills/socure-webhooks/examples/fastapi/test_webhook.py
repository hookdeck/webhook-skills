import base64
import json
import os

# Set test environment variables before importing the app
os.environ["SOCURE_WEBHOOK_USERNAME"] = "riskos-hook"
os.environ["SOCURE_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_socure_request

client = TestClient(app)

USER = os.environ["SOCURE_WEBHOOK_USERNAME"]
PASS = os.environ["SOCURE_WEBHOOK_PASSWORD"]

EVENTS = [
    "evaluation_completed", "evaluation_paused", "reevaluation", "workflow_execution_failed",
    "decision_update", "fraud_confirming", "review_case_assigned", "review_case_unassigned",
    "case_status_updated", "case_notes_added", "case_attachment_added",
    "watchlist_notification_monitored_search_updated", "case_management_notification_case_closure",
]


def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


def sample_payload(event_type="evaluation_completed"):
    return {
        "event_id": "336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb",
        "event_at": "2025-01-15T13:04:11.468Z",
        "event_type": event_type,
        "data": {"id": "onb-12345", "eval_id": "6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816", "decision": "ACCEPT"},
    }


def post(authorization=None, body=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if authorization is not None:
        headers["Authorization"] = authorization
    if body is None:
        body = json.dumps(sample_payload())
    return client.post("/webhooks/socure", content=body, headers=headers)


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme(self):
        assert post(basic(USER, PASS, "basic")).status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("someone-else", PASS)).status_code == 401

    def test_rejects_bearer_token(self):
        assert post("Bearer 6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816").status_code == 401

    @pytest.mark.parametrize("value", [
        "Basic",
        "Basic !!!notbase64",
        "Basic " + base64.b64encode(b"nocolon").decode(),
    ])
    def test_rejects_malformed_values(self, value):
        assert post(value).status_code == 401

    def test_rejects_different_length_and_non_ascii_without_raising(self):
        assert post(basic("x", "y")).status_code == 401
        assert post(basic("üser", "pässwörd")).status_code == 401

    def test_rejects_when_unconfigured(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_socure_request(headers, "", "") is False

    def test_authenticates_before_parsing_body(self):
        assert post(None, "not json").status_code == 401


class TestParseBasicAuth:
    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c")) == (b"a", b"b:c")

    def test_returns_none_for_missing_and_other_schemes(self):
        assert parse_basic_auth(None) is None
        assert parse_basic_auth("Bearer abc") is None


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        res = post(basic(USER, PASS), json.dumps(sample_payload(event_type)))
        assert res.status_code == 200

    def test_acknowledges_unknown_event(self):
        assert post(basic(USER, PASS), json.dumps(sample_payload("something_new"))).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(basic(USER, PASS), json.dumps(sample_payload()), "text/plain").status_code == 200

    def test_rejects_invalid_json(self):
        assert post(basic(USER, PASS), "not json").status_code == 400

    def test_rejects_non_object(self):
        assert post(basic(USER, PASS), "[1,2]").status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
