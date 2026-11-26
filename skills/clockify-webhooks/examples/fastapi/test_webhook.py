# Generated with: clockify-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import os

import pytest

# Synthetic, JWT-shaped tokens (not real Clockify tokens)
TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYyJ9.c3ludGhldGljLXNpZ25hdHVyZS0x"
TOKEN2 = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYzIifQ.c3ludGhldGljLXNpZ25hdHVyZS0y"
os.environ["CLOCKIFY_WEBHOOK_SIGNING_SECRET"] = TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_tokens, verify_clockify_signature  # noqa: E402

client = TestClient(app)

ENTRY = '{"id":"6740a1b2c3d4e5f601234567","description":"Synthetic task","userId":"5a0ab5acb07987125438b60f","workspaceId":"64a687e29ae1f428e7ebe303","projectId":"5b641568b07987035750505e","billable":true,"timeInterval":{"start":"2026-11-18T09:00:00Z","end":"2026-11-18T10:00:00Z","duration":"PT1H"}}'
PROJECT = '{"id":"5b641568b07987035750505e","name":"Synthetic project","workspaceId":"64a687e29ae1f428e7ebe303","clientId":"","archived":false,"billable":true}'


def post(body, signature=None, event_type=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["Clockify-Signature"] = signature
    if event_type is not None:
        headers["clockify-webhook-event-type"] = event_type
    return client.post("/webhooks/clockify", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CLOCKIFY_WEBHOOK_SIGNING_SECRET", TOKEN)


def test_configured_token_is_accepted_and_others_rejected():
    assert verify_clockify_signature(TOKEN, [TOKEN])
    assert not verify_clockify_signature(TOKEN2, [TOKEN])
    assert not verify_clockify_signature(TOKEN[:-1], [TOKEN])
    assert not verify_clockify_signature("", [TOKEN])
    assert not verify_clockify_signature(TOKEN, [])


def test_any_token_from_a_list_is_accepted():
    assert verify_clockify_signature(TOKEN2, parse_tokens(f"{TOKEN}, {TOKEN2}"))


def test_valid_token_with_event_type_header():
    res = post(ENTRY, TOKEN, "NEW_TIME_ENTRY")
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "NEW_TIME_ENTRY", "id": "6740a1b2c3d4e5f601234567"}


def test_valid_token_without_event_type_header():
    res = post(PROJECT, TOKEN)
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": None, "id": "5b641568b07987035750505e"}


def test_second_configured_token_is_accepted(monkeypatch):
    monkeypatch.setenv("CLOCKIFY_WEBHOOK_SIGNING_SECRET", f"{TOKEN},{TOKEN2}")
    assert post(PROJECT, TOKEN2, "NEW_PROJECT").status_code == 200


def test_different_token_is_rejected():
    assert post(ENTRY, TOKEN2).status_code == 401


def test_missing_header_is_rejected():
    assert post(ENTRY).status_code == 401


def test_hmac_of_body_is_rejected():
    digest = hmac.new(TOKEN.encode(), ENTRY.encode(), hashlib.sha256).hexdigest()
    assert post(ENTRY, digest).status_code == 401


def test_trailing_newline_in_configured_token(monkeypatch):
    monkeypatch.setenv("CLOCKIFY_WEBHOOK_SIGNING_SECRET", TOKEN + "\n")
    assert post(ENTRY, TOKEN).status_code == 200


def test_invalid_json_with_valid_token():
    assert post('{"truncated": ', TOKEN).status_code == 400


def test_fails_closed_without_token(monkeypatch):
    monkeypatch.delenv("CLOCKIFY_WEBHOOK_SIGNING_SECRET")
    assert post(ENTRY, TOKEN).status_code == 500
