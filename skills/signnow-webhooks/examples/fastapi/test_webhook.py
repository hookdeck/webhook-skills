# Generated with: signnow-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the SignNow FastAPI webhook receiver."""

import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_signnow_signature

client = TestClient(app)

# SignNow lets you pick any string (up to 300 chars) as the subscription secret_key.
SECRET = "my-signnow-secret-key"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("SIGNNOW_WEBHOOK_SECRET", SECRET)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as SignNow: base64(HMAC-SHA256(secret as UTF-8, raw body))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def make_payload(event: str, content: dict = None) -> bytes:
    return json.dumps(
        {
            "meta": {
                "timestamp": 1728310375,
                "event": event,
                "environment": "https://app.signnow.com/api",
                "callback_url": "https://example.com/webhooks/signnow",
                "access_token": "********",
            },
            "content": content or {},
        }
    ).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-SignNow-Signature"] = signature
    return client.post("/webhooks/signnow", content=body, headers=headers)


def test_accepts_valid_signature(capsys):
    body = make_payload("document.complete", {"document_id": "doc1", "document_name": "NDA"})
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "document.complete" in capsys.readouterr().out


def test_verifies_regardless_of_content_type():
    body = make_payload("document.update", {"document_id": "doc1"})
    assert post(body, sign(body), "text/plain").status_code == 200


def test_rejects_invalid_signature():
    body = make_payload("document.complete", {"document_id": "doc1"})
    res = post(body, sign(body, "wrong"))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_modified_body():
    body = make_payload("document.complete", {"document_id": "doc1"})
    assert post(body.replace(b"doc1", b"doc2"), sign(body)).status_code == 400


def test_rejects_missing_signature():
    res = post(make_payload("document.complete"))
    assert res.status_code == 400
    assert "Missing" in res.json()["detail"]


def test_rejects_hex_signature():
    body = make_payload("document.complete")
    hex_sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert post(body, hex_sig).status_code == 400


def test_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("SIGNNOW_WEBHOOK_SECRET")
    body = make_payload("document.complete")
    assert post(body, sign(body)).status_code == 500


def test_400_for_signed_non_json():
    body = b"not json"
    res = post(body, sign(body), "text/plain")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


@pytest.mark.parametrize(
    "event,content",
    [
        ("document.open", {"document_id": "d"}),
        ("document.update", {"document_id": "d"}),
        ("document.delete", {"document_id": "d"}),
        ("document.fieldinvite.sent", {"document_id": "d"}),
        ("document.fieldinvite.signed", {"document_id": "d"}),
        ("document.fieldinvite.decline", {"document_id": "d"}),
        ("user.document.complete", {"document_id": "d", "user_id": "u"}),
        ("document_group.complete", {"group_id": "g"}),
        ("document_group.invite.signer.complete", {"group_id": "g", "signer_email": "s@example.com"}),
    ],
)
def test_handles_events(event, content, capsys):
    body = make_payload(event, content)
    assert post(body, sign(body)).status_code == 200
    assert "Unhandled" not in capsys.readouterr().out


def test_acknowledges_unknown_events(capsys):
    body = make_payload("template.copy")
    assert post(body, sign(body)).status_code == 200
    assert "Unhandled SignNow event: template.copy" in capsys.readouterr().out


def test_verify_helper_edge_cases():
    body = b"{}"
    assert verify_signnow_signature(body, sign(body), SECRET) is True
    assert verify_signnow_signature(body, "short", SECRET) is False
    assert verify_signnow_signature(body, "", SECRET) is False
    assert verify_signnow_signature(body, sign(body), "") is False
