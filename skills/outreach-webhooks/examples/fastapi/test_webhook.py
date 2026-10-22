import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_outreach_signature

SECRET = "outreach_test_secret_0123456789"
HEADER = "Outreach-Webhook-Signature"

client = TestClient(app)


def sign(body: str, secret: str = SECRET) -> str:
    # Same algorithm as Outreach: bare hex HMAC-SHA256 of the raw body
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


PAYLOAD = json.dumps({
    "data": {"type": "prospect", "id": 42, "attributes": {"firstName": "Ada"}},
    "meta": {"deliveredAt": "2025-10-21T22:54:57.000Z", "eventName": "prospect.created"},
})


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("OUTREACH_WEBHOOK_SECRET", SECRET)


def post(body=PAYLOAD, content_type="application/json", **headers):
    return client.post("/webhooks/outreach", content=body, headers={"content-type": content_type, **headers})


def test_accepts_valid_signature():
    res = post(**{HEADER: sign(PAYLOAD)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_any_content_type():
    res = post(content_type="application/vnd.api+json", **{HEADER: sign(PAYLOAD)})
    assert res.status_code == 200


@pytest.mark.parametrize("event", [
    "prospect.updated", "sequenceState.created", "call.created",
    "task.completed", "mailing.replied", "account.destroyed",
])
def test_handles_documented_events(event):
    body = json.dumps({"data": {"type": "x", "id": 1}, "meta": {"eventName": event}})
    assert post(body, **{HEADER: sign(body)}).status_code == 200


def test_rejects_wrong_secret():
    assert post(**{HEADER: sign(PAYLOAD, "other")}).status_code == 400


def test_rejects_tampered_body():
    assert post(PAYLOAD.replace("Ada", "Eve"), **{HEADER: sign(PAYLOAD)}).status_code == 400


def test_rejects_wrong_length_signature():
    assert post(**{HEADER: "abc123"}).status_code == 400


def test_rejects_missing_header():
    assert post().status_code == 400


def test_invalid_json_with_valid_signature():
    assert post("not json", **{HEADER: sign("not json")}).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("OUTREACH_WEBHOOK_SECRET")
    assert post(**{HEADER: sign(PAYLOAD)}).status_code == 500


def test_verify_helper():
    body = PAYLOAD.encode()
    sig = sign(PAYLOAD)
    assert verify_outreach_signature(body, sig, SECRET)
    assert verify_outreach_signature(body, sig.upper(), SECRET)
    assert not verify_outreach_signature(body, "sha256=" + sig, SECRET)
    assert not verify_outreach_signature(body, None, SECRET)
    assert not verify_outreach_signature(body, sig, None)
