# Generated with: gusto-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import logging
import os

import pytest

TOKEN = "gusto_synthetic_verification_token_9d3f"  # synthetic
os.environ["GUSTO_VERIFICATION_TOKEN"] = TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_gusto_signature  # noqa: E402

client = TestClient(app)

BODY = '{"uuid":"f7397a24-57ad-4fae-b011-d258e8232900","event_type":"payroll.paid","resource_type":"Company","resource_uuid":"5df911a0-e8e9-412d-8aaf-a46ad193dd96","entity_type":"Payroll","entity_uuid":"b50e611d-8f3d-4f24-b001-46675f7b5777","timestamp":1795436100}'
TOKEN_BODY = '{"verification_token":"gusto_synthetic_token_from_handshake"}'


def sign(body, key=TOKEN):
    return hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Gusto-Signature"] = signature
    return client.post("/webhooks/gusto", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("GUSTO_VERIFICATION_TOKEN", TOKEN)


def test_bare_hex_digest_is_accepted():
    assert verify_gusto_signature(BODY, sign(BODY), TOKEN)


def test_base64_and_prefixed_forms_are_rejected():
    digest = hmac.new(TOKEN.encode(), BODY.encode(), hashlib.sha256).digest()
    assert not verify_gusto_signature(BODY, base64.b64encode(digest).decode(), TOKEN)
    assert not verify_gusto_signature(BODY, "sha256=" + digest.hex(), TOKEN)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "payroll.paid", "uuid": "f7397a24-57ad-4fae-b011-d258e8232900"}


def test_handshake_before_token_is_configured_shows_token(monkeypatch, caplog):
    monkeypatch.delenv("GUSTO_VERIFICATION_TOKEN")
    with caplog.at_level(logging.INFO, logger="gusto-webhooks"):
        res = post(TOKEN_BODY)
    assert res.status_code == 200
    assert res.json() == {"received": True, "verification_token_received": True}
    assert "gusto_synthetic_token_from_handshake" in caplog.text


def test_resent_token_once_configured_is_not_logged(caplog):
    with caplog.at_level(logging.INFO, logger="gusto-webhooks"):
        res = post(TOKEN_BODY)
    assert res.status_code == 200
    assert "gusto_synthetic_token_from_handshake" not in caplog.text


def test_unsigned_event_with_token_field_is_rejected():
    assert post('{"event_type":"payroll.paid","verification_token":"x"}').status_code == 401


def test_other_token_is_rejected():
    assert post(BODY, sign(BODY, "another_token")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace("payroll.paid", "payroll.reversed"), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_token_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("GUSTO_VERIFICATION_TOKEN", TOKEN + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_events_fail_closed_without_token(monkeypatch):
    monkeypatch.delenv("GUSTO_VERIFICATION_TOKEN")
    assert post(BODY, sign(BODY)).status_code == 500
