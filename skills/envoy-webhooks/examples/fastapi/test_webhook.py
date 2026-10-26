# Generated with: envoy-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Envoy FastAPI webhook receiver."""

import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_envoy_signature

client = TestClient(app)

# Envoy signs with your app's client secret.
SECRET = "test_envoy_client_secret"

EVENTS = [
    "entry_sign_in",
    "entry_sign_out",
    "entry_blacklist_review",
    "entry_blacklist_deny",
    "entry_manually_updated",
    "invite_created",
    "invite_updated",
    "invite_removed",
    "upcoming_visit",
    "qr_code_sent",
    "employee_invite_created",
    "employee_invite_updated",
    "employee_upcoming_visit",
    "employee_entry_sign_in",
    "employee_entry_sign_out",
    "employee_entry_blacklist_review",
    "employee_entry_blacklist_deny",
    "location_capacity_updated",
    "desk_sign_in",
    "ticket_created",
]


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("ENVOY_CLIENT_SECRET", SECRET)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Envoy: base64(HMAC-SHA256(client secret, raw body))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def make_payload(event: str) -> bytes:
    return json.dumps(
        {
            "event": event,
            "meta": {
                "location": {"id": "94082", "type": "locations", "attributes": {"name": "HQ"}},
                "company": {"id": "75254", "type": "companies", "attributes": {"name": "Envoy"}},
            },
            "payload": {"id": "80078985", "type": "entries", "attributes": {"full-name": "John Doe"}},
        }
    ).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Envoy-Signature"] = signature
    return client.post("/webhooks/envoy", content=body, headers=headers)


def test_accepts_valid_signature(capsys):
    body = make_payload("entry_sign_in")
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "entry_sign_in" in capsys.readouterr().out


def test_verifies_regardless_of_content_type():
    body = make_payload("invite_created")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_rejects_invalid_signature():
    body = make_payload("entry_sign_in")
    res = post(body, sign(body, "wrong"))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_modified_body():
    body = make_payload("entry_sign_in")
    assert post(body.replace(b"John Doe", b"Eve"), sign(body)).status_code == 400


def test_rejects_missing_signature():
    res = post(make_payload("entry_sign_in"))
    assert res.status_code == 400
    assert "Missing" in res.json()["detail"]


def test_rejects_hex_signature():
    body = make_payload("entry_sign_in")
    hex_sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert post(body, hex_sig).status_code == 400


def test_non_ascii_signature_is_400_not_500():
    body = make_payload("entry_sign_in")
    res = client.post(
        "/webhooks/envoy",
        content=body,
        headers={"Content-Type": "application/json", "X-Envoy-Signature": "sígnature".encode("utf-8")},
    )
    assert res.status_code == 400


def test_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("ENVOY_CLIENT_SECRET")
    body = make_payload("entry_sign_in")
    assert post(body, sign(body)).status_code == 500


def test_400_for_signed_non_json():
    body = b"not json"
    res = post(body, sign(body), "text/plain")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


@pytest.mark.parametrize("event", EVENTS)
def test_handles_events(event, capsys):
    body = make_payload(event)
    assert post(body, sign(body)).status_code == 200
    assert "Unhandled" not in capsys.readouterr().out


def test_acknowledges_unknown_events(capsys):
    body = make_payload("something_new")
    assert post(body, sign(body)).status_code == 200
    assert "Unhandled Envoy event: something_new" in capsys.readouterr().out


def test_verify_helper_edge_cases():
    body = b"{}"
    assert verify_envoy_signature(body, sign(body), SECRET) is True
    assert verify_envoy_signature(body, "short", SECRET) is False
    assert verify_envoy_signature(body, "sígnature", SECRET) is False
    assert verify_envoy_signature(body, "", SECRET) is False
    assert verify_envoy_signature(body, sign(body), "") is False
