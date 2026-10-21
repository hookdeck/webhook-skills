# Generated with: dealhub-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the DealHub FastAPI webhook receiver.

DealHub has no signature: the "real credential" a test can generate is the
exact Authorization header DealHub sends in Token or Basic mode.
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from main import app, event_name, expected_authorization, verify_dealhub_authorization

client = TestClient(app)

TOKEN = "dh_test_token_9f8e7d6c5b4a"
USERNAME = "dealhub"
PASSWORD = "s3cr3t-p@ss"
BEARER = f"Bearer {TOKEN}"
BASIC = "Basic " + base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()

# Trimmed from DealHub's documented draftQuote example, plus event_info.
DRAFT_QUOTE = {
    "event": "draftQuote",
    "status": "Draft",
    "quote_upgrade_required": False,
    "newly_created_quote": True,
    "external_opportunity_id": "786865656565",
    "external_customer_id": "65545425413",
    "dealhub_opportunity_id": "2323232565685498",
    "dealhub_quote_id": "6563232565685498",
    "primary_quote": False,
    "executed_by": "john.smith@mydomain.com",
    "execution_date": "2021-10-22 16:39:08",
    "sync_flag": True,
    "quote_summary": {"currency": "USD", "total_list_price": 4600.0, "total_net_price": 3000.0},
    "event_info": {"webhook_id": "wh_1", "event_id": "evt_1", "api_version": "1.0"},
}

PRIMARY_QUOTE = {**DRAFT_QUOTE, "event": "primaryQuote"}

ENV_VARS = ("DEALHUB_WEBHOOK_TOKEN", "DEALHUB_WEBHOOK_USERNAME", "DEALHUB_WEBHOOK_PASSWORD")


@pytest.fixture(autouse=True)
def clear_env(monkeypatch):
    for name in ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def token_mode(monkeypatch):
    monkeypatch.setenv("DEALHUB_WEBHOOK_TOKEN", TOKEN)


@pytest.fixture
def basic_mode(monkeypatch):
    monkeypatch.setenv("DEALHUB_WEBHOOK_USERNAME", USERNAME)
    monkeypatch.setenv("DEALHUB_WEBHOOK_PASSWORD", PASSWORD)


def send(body, authorization=None):
    headers = {"content-type": "application/json"}
    if authorization is not None:
        headers["authorization"] = authorization
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/dealhub", content=content, headers=headers)


class TestTokenMode:
    def test_accepts_full_bearer_header(self, token_mode):
        res = send(DRAFT_QUOTE, BEARER)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_handles_primary_quote(self, token_mode):
        assert send(PRIMARY_QUOTE, BEARER).status_code == 200

    def test_rejects_bare_token_without_scheme(self, token_mode):
        assert send(DRAFT_QUOTE, TOKEN).status_code == 401

    def test_rejects_wrong_token(self, token_mode):
        assert send(DRAFT_QUOTE, "Bearer wrong_token").status_code == 401

    def test_rejects_different_length_value(self, token_mode):
        assert send(DRAFT_QUOTE, BEARER + "x").status_code == 401

    def test_rejects_missing_header(self, token_mode):
        res = send(DRAFT_QUOTE)
        assert res.status_code == 401
        assert "Missing" in res.json()["detail"]

    def test_rejects_basic_when_token_configured(self, token_mode):
        assert send(DRAFT_QUOTE, BASIC).status_code == 401

    def test_invalid_json_after_auth(self, token_mode):
        assert send("{not json", BEARER).status_code == 400


class TestBasicMode:
    def test_accepts_full_basic_header(self, basic_mode):
        assert send(DRAFT_QUOTE, BASIC).status_code == 200

    def test_rejects_wrong_password(self, basic_mode):
        bad = "Basic " + base64.b64encode(f"{USERNAME}:nope".encode()).decode()
        assert send(DRAFT_QUOTE, bad).status_code == 401


class TestConfiguration:
    def test_fails_closed_when_unconfigured(self):
        assert send(DRAFT_QUOTE, BEARER).status_code == 500

    def test_expected_authorization(self):
        assert expected_authorization({"DEALHUB_WEBHOOK_TOKEN": TOKEN}) == BEARER
        assert (
            expected_authorization(
                {"DEALHUB_WEBHOOK_USERNAME": USERNAME, "DEALHUB_WEBHOOK_PASSWORD": PASSWORD}
            )
            == BASIC
        )
        assert expected_authorization({}) is None

    def test_verify_handles_missing_values(self):
        assert verify_dealhub_authorization(None, BEARER) is False
        assert verify_dealhub_authorization(BEARER, None) is False
        assert verify_dealhub_authorization(BEARER, BEARER) is True


EVENT_PAYLOADS = [
    ("quoteWon", {"event": "quoteWon", "status": "Won", "dealhub_quote_id": "q1"}),
    ("version", {"event": "version", "action": "activated", "status": "active", "version_id": "v1"}),
    ("user", {"event": "user", "action": "deleted", "user_id": "u1", "user_login": "James_Parker"}),
    (
        "productsUpload",
        {"event": "productsUpload", "upload_status": "error", "version_id": "v1", "imported_skus": "29", "errors": "4"},
    ),
    (
        "DEALROOM_EVENT",
        {"event": "DEALROOM_EVENT", "dealhub_quote_id": "q1", "action_summary": {"DEAL_SIGN": "John signed DealRoom"}},
    ),
    ("Failure WebHook v1", {"error_code": "E1", "error_description": "Version activation failed"}),
]


@pytest.mark.parametrize("name,payload", EVENT_PAYLOADS)
def test_event_dispatch(token_mode, name, payload):
    assert event_name(payload) == name
    assert send(payload, BEARER).status_code == 200


def test_unknown_event_returns_200(token_mode):
    assert send({"event": "somethingNew"}, BEARER).status_code == 200


def test_health():
    assert client.get("/health").status_code == 200
