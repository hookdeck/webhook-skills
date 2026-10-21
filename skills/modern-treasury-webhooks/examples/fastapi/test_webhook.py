import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Modern Treasury webhook keys are used as raw strings (no prefix, no decoding)
WEBHOOK_KEY = "test_webhook_key_for_modern_treasury"
os.environ["MODERN_TREASURY_WEBHOOK_KEY"] = WEBHOOK_KEY

from main import app, verify_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, key: str = WEBHOOK_KEY) -> str:
    """Same algorithm as Modern Treasury: lowercase hex HMAC-SHA256 of the raw body."""
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def post(body, topic="payment_order", signature="auto", webhook_id=None, content_type="application/json"):
    raw = body if isinstance(body, bytes) else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
    headers = {"Content-Type": content_type, "X-Topic": topic}
    if signature == "auto":
        headers["X-Signature"] = sign(raw)
    elif signature is not None:
        headers["X-Signature"] = signature
    if webhook_id:
        headers["X-Webhook-ID"] = webhook_id
    return client.post("/webhooks/modern-treasury", content=raw, headers=headers)


COMPLETED = {
    "event": "completed",
    "data": {"id": "0198860a-5655-7dbc-9cbd-6616a8090fa8", "object": "payment_order", "status": "completed"},
}


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setenv("MODERN_TREASURY_WEBHOOK_KEY", WEBHOOK_KEY)


def test_accepts_payment_order_completed():
    res = post(COMPLETED)
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize(
    "topic,event",
    [
        ("payment_order", "failed"),
        ("payment_order", "reconciled"),
        ("expected_payment", "reconciled"),
        ("incoming_payment_detail", "completed"),
        ("transaction", "created"),
        ("return", "created"),
    ],
)
def test_accepts_documented_events(topic, event):
    assert post({"event": event, "data": {"id": "abc"}}, topic=topic).status_code == 200


def test_accepts_unknown_events_after_verifying():
    assert post({"event": "something_new", "data": {}}, topic="new_topic").status_code == 200


def test_rejects_invalid_signature():
    assert post(COMPLETED, signature="a" * 64).status_code == 400


def test_rejects_wrong_key():
    raw = json.dumps(COMPLETED).encode()
    assert post(raw, signature=sign(raw, "other_key")).status_code == 400


def test_rejects_wrong_length_signature_without_error():
    assert post(COMPLETED, signature="abc123").status_code == 400


def test_rejects_missing_signature():
    assert post(COMPLETED, signature=None).status_code == 400


def test_rejects_tampered_body():
    signature = sign(json.dumps(COMPLETED).encode())
    tampered = {**COMPLETED, "event": "failed"}
    assert post(tampered, signature=signature).status_code == 400


def test_signs_exact_bytes_received():
    raw = b'{ "event":  "completed",\n "data": {"id": "spaced"} }'
    assert post(raw).status_code == 200


def test_verifies_regardless_of_content_type():
    assert post(COMPLETED, content_type="text/plain").status_code == 200


def test_rejects_validly_signed_non_json():
    assert post("not json").status_code == 400


def test_flags_retried_webhook_as_duplicate():
    first = post(COMPLETED, webhook_id="wh_retry_1")
    second = post(COMPLETED, webhook_id="wh_retry_1")
    assert first.json() == {"received": True}
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


def test_returns_500_when_key_not_configured(monkeypatch):
    monkeypatch.delenv("MODERN_TREASURY_WEBHOOK_KEY")
    assert post(COMPLETED).status_code == 500


def test_verify_signature_helper():
    body = b'{"event":"created"}'
    assert verify_signature(body, sign(body), WEBHOOK_KEY)
    assert verify_signature(body, sign(body).upper(), WEBHOOK_KEY)
    assert not verify_signature(body, None, WEBHOOK_KEY)
    assert not verify_signature(body, "abc", None)
