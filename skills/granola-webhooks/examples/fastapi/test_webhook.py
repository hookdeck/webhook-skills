import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Granola signing secrets are 'whsec_' + base64-encoded key bytes
WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"test_granola_signing_secret_key").decode()
os.environ["GRANOLA_WEBHOOK_SECRET"] = WEBHOOK_SECRET

from main import app  # noqa: E402

client = TestClient(app)

EVENT_ID = "8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b"

GENERATED = {
    "event_id": EVENT_ID,
    "event_type": "note.generated",
    "note_id": "not_1d3tmYTlCICgjy",
    "occurred_at": "2026-01-27T15:30:00Z",
}
EDITED = {**GENERATED, "event_type": "note.edited", "data": {"changed_fields": ["summary"]}}
ACCESS_GRANTED = {**GENERATED, "event_type": "note.access_granted"}


def sign(body: str, msg_id: str, timestamp: int, secret: str = WEBHOOK_SECRET) -> str:
    """Sign exactly as Granola does (Standard Webhooks):
    base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
    """
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def post(payload, *, timestamp=None, signature=None, secret=WEBHOOK_SECRET, omit=None,
         send_body=None, content_type="application/json"):
    body = json.dumps(payload)
    ts = timestamp if timestamp is not None else int(time.time())
    headers = {
        "content-type": content_type,
        "webhook-id": EVENT_ID,
        "webhook-timestamp": str(ts),
        "webhook-signature": signature or sign(body, EVENT_ID, ts, secret),
    }
    if omit:
        del headers[omit]
    return client.post("/webhooks/granola", content=send_body or body, headers=headers)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("GRANOLA_WEBHOOK_SECRET", WEBHOOK_SECRET)


@pytest.mark.parametrize("payload", [GENERATED, EDITED, ACCESS_GRANTED], ids=lambda p: p["event_type"])
def test_accepts_signed_event(payload):
    res = post(payload)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_any_content_type():
    assert post(GENERATED, content_type="text/plain").status_code == 200


def test_accepts_when_one_of_several_signatures_matches():
    ts = int(time.time())
    good = sign(json.dumps(GENERATED), EVENT_ID, ts)
    res = post(GENERATED, timestamp=ts, signature=f"v1,aW52YWxpZHNpZ25hdHVyZQ== {good}")
    assert res.status_code == 200


def test_rejects_invalid_signature():
    assert post(GENERATED, signature="v1,aW52YWxpZHNpZ25hdHVyZQ==").status_code == 400


def test_rejects_signature_from_different_secret():
    other = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    assert post(GENERATED, secret=other).status_code == 400


def test_rejects_tampered_body():
    tampered = json.dumps({**GENERATED, "note_id": "not_tampered"})
    assert post(GENERATED, send_body=tampered).status_code == 400


def test_rejects_old_timestamp():
    assert post(GENERATED, timestamp=int(time.time()) - 600).status_code == 400


@pytest.mark.parametrize("header", ["webhook-id", "webhook-timestamp", "webhook-signature"])
def test_rejects_missing_header(header):
    assert post(GENERATED, omit=header).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("GRANOLA_WEBHOOK_SECRET")
    assert post(GENERATED).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
