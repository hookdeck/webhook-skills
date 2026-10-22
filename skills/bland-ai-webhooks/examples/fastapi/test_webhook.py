# Generated with: bland-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import uuid

import pytest

SECRET = "test_bland_webhook_signing_secret"
os.environ["BLAND_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_bland_signature  # noqa: E402

client = TestClient(app)


def sign(raw: bytes, secret: str = SECRET) -> str:
    """Sign exactly like Bland: hex HMAC-SHA256 of the body."""
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def post(raw: bytes, headers=None, content_type="application/json"):
    h = {"content-type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/bland-ai", content=raw, headers=h)


def post_signed(payload, secret=SECRET, content_type="application/json"):
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return post(raw, {"x-webhook-signature": sign(raw, secret)}, content_type)


def call_id():
    return str(uuid.uuid4())


def post_call(**extra):
    payload = {
        "call_id": call_id(),
        "c_id": call_id(),
        "call_length": 0.18,
        "to": "+15551234567",
        "from": "+15559876543",
        "completed": True,
        "inbound": False,
        "queue_status": "complete",
        "status": "completed",
        "error_message": None,
        "transcripts": [
            {"id": 1, "user": "user", "text": "Hello? ", "created_at": "2025-09-12T20:39:13.173+00:00"},
            {"id": 2, "user": "assistant", "text": "This is a test call from Bland.", "created_at": "2025-09-12T20:39:13.566+00:00"},
        ],
    }
    payload.update(extra)
    return payload


def test_accepts_valid_post_call_payload():
    res = post_signed(post_call())
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize("ct", ["text/plain", "application/octet-stream", "application/json; charset=utf-8"])
def test_accepts_any_content_type(ct):
    assert post_signed(post_call(), content_type=ct).status_code == 200


def test_handles_failed_call():
    res = post_signed(
        post_call(status="failed", completed=False, error_message="Call failed. The number you dialed is busy. Please try again later.")
    )
    assert res.status_code == 200


@pytest.mark.parametrize(
    "extra",
    [
        {"event_type": "citations", "citations": [{"variable_name": "firstName", "value": "James"}]},
        {"event_type": "post_transfer_transcript", "post_transfer_transcript": []},
        {"event_type": "evals"},
        {"event_type": "multiple", "contents": ["citations", "post_transfer_transcript"]},
    ],
)
def test_handles_enrichment_payloads(extra):
    res = post_signed(post_call(**extra))
    assert res.status_code == 200
    assert "duplicate" not in res.json()


def test_handles_sms_conversation_payload():
    res = post_signed({"conversation_id": call_id(), "channel": "sms", "message": "hi", "sender": "USER"})
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = post(json.dumps(post_call()).encode())
    assert res.status_code == 400
    assert "Missing" in res.json()["detail"]


def test_rejects_wrong_secret():
    res = post_signed(post_call(), secret="some_other_secret")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_tampered_body():
    original = json.dumps(post_call()).encode()
    res = post(original.replace(b"completed", b"failed"), {"x-webhook-signature": sign(original)})
    assert res.status_code == 400


def test_rejects_wrong_length_signature():
    res = post(json.dumps(post_call()).encode(), {"x-webhook-signature": "abc123"})
    assert res.status_code == 400


def test_rejects_signed_non_json_body():
    raw = b"not json"
    res = post(raw, {"x-webhook-signature": sign(raw)}, "text/plain")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


def test_redelivery_is_duplicate():
    payload = post_call()
    assert post_signed(payload).json() == {"received": True}
    second = post_signed(payload)
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


def test_citations_not_deduped_against_post_call():
    cid = call_id()
    post_signed(post_call(call_id=cid))
    res = post_signed(post_call(call_id=cid, event_type="citations", citations=[]))
    assert "duplicate" not in res.json()


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("BLAND_WEBHOOK_SECRET")
    assert post_signed(post_call()).status_code == 500


def test_verify_function():
    body = b'{"call_id":"abc"}'
    assert verify_bland_signature(body, sign(body), SECRET)
    assert verify_bland_signature(body, sign(body).upper(), SECRET)
    assert not verify_bland_signature(body, sign(body, "x"), SECRET)
    assert not verify_bland_signature(body, None, SECRET)
    assert not verify_bland_signature(body, sign(body), "")
