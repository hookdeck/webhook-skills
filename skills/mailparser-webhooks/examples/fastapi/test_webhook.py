# Generated with: mailparser-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Mailparser FastAPI webhook receiver.

Mailparser has no signature: the credential is the exact Additional Header
value configured on the webhook (a secret header, or Basic Auth as in the docs).
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from main import app, body_hash, header_name, verify_mailparser_header

client = TestClient(app)

SECRET = "c0ffee5ecret9f8e7d6c5b4a3928170615"
BASIC = "Basic " + base64.b64encode(b"mailparser:s3cr3t-p@ss").decode()

# Body is whatever the HTTP Body Payload Template renders.
PARSED = {"invoice_number": "INV-1042", "total": "129.00", "from": "billing@example.com"}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MAILPARSER_WEBHOOK_HEADER", "X-Webhook-Secret")
    monkeypatch.setenv("MAILPARSER_WEBHOOK_SECRET", SECRET)


def post(headers, body=None):
    data = json.dumps(PARSED) if body is None else body
    return client.post(
        "/webhooks/mailparser",
        content=data,
        headers={"Content-Type": "application/json", **headers},
    )


def test_accepts_configured_secret_header():
    res = post({"X-Webhook-Secret": SECRET})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_header_name_is_case_insensitive():
    assert post({"x-webhook-secret": SECRET}).status_code == 200


def test_accepts_basic_auth_in_authorization_header(monkeypatch):
    monkeypatch.setenv("MAILPARSER_WEBHOOK_HEADER", "Authorization")
    monkeypatch.setenv("MAILPARSER_WEBHOOK_SECRET", BASIC)
    assert post({"Authorization": BASIC}).status_code == 200


def test_rejects_basic_auth_without_scheme_prefix(monkeypatch):
    monkeypatch.setenv("MAILPARSER_WEBHOOK_HEADER", "Authorization")
    monkeypatch.setenv("MAILPARSER_WEBHOOK_SECRET", BASIC)
    assert post({"Authorization": BASIC.replace("Basic ", "")}).status_code == 401


def test_rejects_wrong_secret():
    assert post({"X-Webhook-Secret": "wrong"}).status_code == 401


def test_rejects_same_length_secret():
    assert post({"X-Webhook-Secret": "x" * len(SECRET)}).status_code == 401


def test_rejects_missing_header():
    assert post({}).status_code == 401


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("MAILPARSER_WEBHOOK_SECRET")
    assert post({"X-Webhook-Secret": SECRET}).status_code == 500


def test_returns_400_for_invalid_json():
    assert post({"X-Webhook-Secret": SECRET}, "{not json").status_code == 400


def test_returns_400_for_non_object_json():
    assert post({"X-Webhook-Secret": SECRET}, "[1,2]").status_code == 400


def test_does_not_leak_parse_errors_to_unauthenticated_callers():
    assert post({"X-Webhook-Secret": "wrong"}, "{not json").status_code == 401


def test_header_name_default():
    assert header_name({}) == "x-webhook-secret"
    assert header_name({"MAILPARSER_WEBHOOK_HEADER": " Authorization "}) == "authorization"


def test_verify_fails_closed_and_handles_length_mismatch():
    assert verify_mailparser_header(None, SECRET) is False
    assert verify_mailparser_header(SECRET, None) is False
    assert verify_mailparser_header("short", SECRET) is False
    assert verify_mailparser_header(SECRET, SECRET) is True


def test_body_hash_is_sha256_hex():
    assert body_hash(b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
