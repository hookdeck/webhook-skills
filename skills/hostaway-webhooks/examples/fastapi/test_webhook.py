import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "hostaway-hook"
PASSWORD = "p@ss:word/with+colon"
os.environ["HOSTAWAY_WEBHOOK_USERNAME"] = USERNAME
os.environ["HOSTAWAY_WEBHOOK_PASSWORD"] = PASSWORD

import pytest
from fastapi.testclient import TestClient

from main import app, get_event_name, parse_basic_auth, verify_hostaway_request

client = TestClient(app)

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
EVENTS = [
    "reservation.created",
    "reservation.updated",
    "message.received",
    "task.created",
    "task.updated",
]


def basic(user: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


GOOD = basic(USERNAME, PASSWORD)


def payload(event="reservation.created"):
    # Illustrative payload: Hostaway doesn't document the unified webhook body field by field.
    return json.dumps(
        {"event": event, "data": {"id": 1001, "listingMapId": 2002, "guestName": "Jane Doe", "status": "new"}}
    )


def send(method, auth=None, body=None, content_type="application/json"):
    headers = {}
    if auth is not None:
        headers["Authorization"] = auth
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, "/webhooks/hostaway", headers=headers, content=body)


class TestBasicAuth:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_valid_credentials(self, method):
        res = send(method, GOOD, None if method == "GET" else payload())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_credential_first(self, method):
        assert send(method, None, None if method == "GET" else payload()).status_code == 401

    def test_accepts_lowercase_scheme(self):
        assert send("POST", GOOD.replace("Basic", "basic"), "{}").status_code == 200

    def test_accepts_non_ascii_password(self):
        headers = {"authorization": basic("üser", "pässwörd:ü")}
        assert verify_hostaway_request(headers, "üser", "pässwörd:ü") is True
        assert verify_hostaway_request(headers, "üser", "other") is False

    def test_rejects_wrong_username(self):
        assert send("POST", basic("nope", PASSWORD), "{}").status_code == 401

    def test_rejects_wrong_password(self):
        assert send("POST", basic(USERNAME, "nope"), "{}").status_code == 401

    def test_rejects_password_prefix(self):
        assert send("POST", basic(USERNAME, PASSWORD[:-1]), "{}").status_code == 401

    def test_rejects_missing_header(self):
        assert send("POST", None, "{}").status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert send("POST", "Bearer " + GOOD[6:], "{}").status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"no-colon-here").decode()
        assert send("POST", header, "{}").status_code == 401

    def test_rejects_invalid_base64(self):
        assert send("POST", "Basic !!!not-base64!!!", "{}").status_code == 401

    def test_rejects_valid_credentials_followed_by_junk(self):
        assert send("POST", GOOD + "@@@", "{}").status_code == 401
        assert send("POST", GOOD + " extra", "{}").status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        assert verify_hostaway_request({"authorization": basic("", "")}, "", "") is False
        assert verify_hostaway_request({"authorization": GOOD}, "", PASSWORD) is False

    def test_parses_first_colon_only(self):
        assert parse_basic_auth(GOOD) == (USERNAME, PASSWORD)


class TestEventsAndBodies:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event):
        assert send("POST", GOOD, payload(event)).status_code == 200

    def test_reads_alternative_event_names(self):
        assert get_event_name({"eventType": "task.updated"}) == "task.updated"
        assert get_event_name({"object": "message", "action": "received"}) == "message.received"
        assert get_event_name({"foo": "bar"}) is None
        assert get_event_name(None) is None

    def test_accepts_empty_body(self):
        assert send("POST", GOOD).status_code == 200

    def test_accepts_and_logs_unknown_shapes(self, capsys):
        res = send("POST", GOOD, json.dumps({"something": "else"}))
        assert res.status_code == 200
        assert "Unhandled event: None ['something']" in capsys.readouterr().out

    def test_accepts_non_json_body(self):
        res = send("POST", GOOD, "event=reservation.created", "application/x-www-form-urlencoded")
        assert res.status_code == 200

    def test_other_methods_are_not_routed(self):
        assert send("OPTIONS", GOOD).status_code == 405
