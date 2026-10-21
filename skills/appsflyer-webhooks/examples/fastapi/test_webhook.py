# Generated with: appsflyer-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the AppsFlyer FastAPI webhook receiver.

AppsFlyer has no signature: the "real credential" is the custom header
name/value configured in the Push API settings.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app, event_name, header_name, idempotency_key, verify_appsflyer_token

client = TestClient(app)

TOKEN = "af_test_token_9f8e7d6c5b4a"

INSTALL = {
    "event_name": "install",
    "appsflyer_id": "1700000000000-1234567",
    "app_id": "id123456789",
    "event_time": "2026-10-21 09:30:00",
    "media_source": "organic",
}
PURCHASE = {
    **INSTALL,
    "event_name": "af_purchase",
    "event_value": '{"af_revenue":"9.99","af_currency":"USD"}',
}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("APPSFLYER_AUTH_TOKEN", TOKEN)
    monkeypatch.delenv("APPSFLYER_AUTH_HEADER_NAME", raising=False)


def send(body, headers=None):
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/appsflyer",
        content=data,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestAuthorizationHeader:
    def test_accepts_correct_token(self):
        res = send(INSTALL, {"Authorization": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("APPSFLYER_AUTH_HEADER_NAME", "X-AF-Token")
        assert send(PURCHASE, {"x-af-token": TOKEN}).status_code == 200

    def test_rejects_token_in_wrong_header_when_custom_name_set(self, monkeypatch):
        monkeypatch.setenv("APPSFLYER_AUTH_HEADER_NAME", "X-AF-Token")
        assert send(INSTALL, {"Authorization": TOKEN}).status_code == 401

    def test_rejects_wrong_token(self):
        assert send(INSTALL, {"Authorization": "wrong-token"}).status_code == 401

    def test_rejects_different_length_token(self):
        assert send(INSTALL, {"Authorization": TOKEN + "x"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send(INSTALL).status_code == 401

    def test_fails_closed_when_unconfigured(self, monkeypatch):
        monkeypatch.delenv("APPSFLYER_AUTH_TOKEN")
        assert send(INSTALL, {"Authorization": TOKEN}).status_code == 500


class TestBodyHandling:
    def test_invalid_json_after_auth_is_400(self):
        assert send("not json", {"Authorization": TOKEN}).status_code == 400

    def test_auth_runs_before_parsing(self):
        assert send("not json", {"Authorization": "wrong"}).status_code == 401

    def test_unknown_in_app_event_is_accepted(self):
        res = send({**INSTALL, "event_name": "level_up"}, {"Authorization": TOKEN})
        assert res.status_code == 200


class TestHelpers:
    def test_verify_appsflyer_token(self):
        assert verify_appsflyer_token(TOKEN, TOKEN)
        assert not verify_appsflyer_token("nope", TOKEN)
        assert not verify_appsflyer_token(None, TOKEN)
        assert not verify_appsflyer_token(TOKEN, None)

    def test_header_name_default_and_lowercase(self):
        assert header_name({}) == "authorization"
        assert header_name({"APPSFLYER_AUTH_HEADER_NAME": "X-AF-Token"}) == "x-af-token"

    def test_event_name(self):
        assert event_name(INSTALL) == "install"
        assert event_name(PURCHASE) == "af_purchase"
        assert event_name({}) == "unknown"
        assert event_name([]) == "unknown"

    def test_idempotency_key(self):
        assert idempotency_key(INSTALL) == "1700000000000-1234567|install|2026-10-21 09:30:00"
