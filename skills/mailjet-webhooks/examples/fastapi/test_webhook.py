import base64
import logging
import os

import pytest
from fastapi.testclient import TestClient

USERNAME = "mailjet"
# Passwords may contain ':' - the handler must split on the first colon only
PASSWORD = "p4ss:word-with-colon"

# Configure env BEFORE importing the app
os.environ["MAILJET_WEBHOOK_USERNAME"] = USERNAME
os.environ["MAILJET_WEBHOOK_PASSWORD"] = PASSWORD

from main import app  # noqa: E402

client = TestClient(app)


def basic(user=USERNAME, pwd=PASSWORD):
    # Mailjet sends the credentials from https://user:pass@host/... as Basic auth
    return "Basic " + base64.b64encode(f"{user}:{pwd}".encode()).decode()


BASE = {
    "time": 1433333949,
    "MessageID": 19421777835146490,
    "email": "api@mailjet.com",
    "mj_campaign_id": 7257,
    "mj_contact_id": 4,
    "customcampaign": "",
    "CustomID": "helloworld",
    "Payload": "",
}

EVENTS = {
    "sent": {**BASE, "event": "sent", "smtp_reply": "sent (250 2.0.0 OK)"},
    "open": {**BASE, "event": "open", "ip": "127.0.0.1", "geo": "US", "agent": "Mozilla/5.0"},
    "click": {**BASE, "event": "click", "url": "https://mailjet.com", "ip": "127.0.0.1", "geo": "FR", "agent": "Mozilla/5.0"},
    "bounce": {**BASE, "event": "bounce", "blocked": False, "hard_bounce": True, "error_related_to": "recipient", "error": "user unknown", "comment": "550"},
    "blocked": {**BASE, "event": "blocked", "error_related_to": "recipient", "error": "user unknown"},
    "spam": {**BASE, "event": "spam", "source": "JMRPP"},
    "unsub": {**BASE, "event": "unsub", "mj_list_id": 1, "ip": "127.0.0.1", "geo": "FR", "agent": "Mozilla/5.0"},
}


def post(body, auth=None):
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = auth
    if isinstance(body, str):
        return client.post("/webhooks/mailjet", content=body, headers=headers)
    return client.post("/webhooks/mailjet", json=body, headers=headers)


class TestAuthentication:
    def test_accepts_valid_credentials(self):
        assert post(EVENTS["open"], basic()).status_code == 200

    def test_rejects_missing_header(self):
        res = post(EVENTS["open"])
        assert res.status_code == 401
        assert "Basic" in res.headers["www-authenticate"]

    def test_rejects_wrong_password(self):
        assert post(EVENTS["open"], basic(pwd="wrong")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(EVENTS["open"], basic(user="someone")).status_code == 401

    def test_rejects_prefix_or_extension_of_password(self):
        assert post(EVENTS["open"], basic(pwd=PASSWORD + "x")).status_code == 401
        assert post(EVENTS["open"], basic(pwd=PASSWORD[:-1])).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(EVENTS["open"], "Bearer abc").status_code == 401

    def test_rejects_malformed_base64(self):
        assert post(EVENTS["open"], "Basic !!!not-base64!!!").status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert post(EVENTS["open"], header).status_code == 401

    def test_does_not_process_events_when_unauthorized(self, caplog):
        with caplog.at_level(logging.INFO, logger="mailjet"):
            post(EVENTS["bounce"], basic(pwd="wrong"))
        assert caplog.records == []

    def test_returns_500_when_not_configured(self, monkeypatch):
        monkeypatch.delenv("MAILJET_WEBHOOK_PASSWORD")
        assert post(EVENTS["open"], basic()).status_code == 500


class TestEvents:
    @pytest.mark.parametrize("name", list(EVENTS))
    def test_handles_each_event_type(self, name):
        res = post(EVENTS[name], basic())
        assert res.status_code == 200
        assert res.json() == {"received": 1}

    def test_reports_hard_bounces(self, caplog):
        with caplog.at_level(logging.INFO, logger="mailjet"):
            post(EVENTS["bounce"], basic())
        assert "hard" in caplog.text

    def test_handles_grouped_events_array(self):
        res = post([EVENTS["sent"], EVENTS["open"], EVENTS["click"]], basic())
        assert res.status_code == 200
        assert res.json() == {"received": 3}

    def test_acknowledges_unknown_event_types(self):
        assert post({**BASE, "event": "future_event"}, basic()).status_code == 200


class TestPayloadValidation:
    def test_rejects_invalid_json(self):
        assert post("{not json", basic()).status_code == 400

    def test_rejects_missing_event_field(self):
        assert post({"email": "a@b.c"}, basic()).status_code == 400

    def test_rejects_array_with_malformed_event(self):
        assert post([EVENTS["open"], "nope"], basic()).status_code == 400
