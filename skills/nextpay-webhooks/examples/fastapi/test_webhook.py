import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

EVENT_TYPES = [
    'v2.payment_intent.succeeded', 'v2.payment_intent.canceled',
    'v2.payment_instrument.used', 'v2.payment_instrument.payment_received',
    'v2.payment_instrument.payment_settled', 'payout_request.creation_failed',
    'payout_request.queued', 'payout_request.queue_failed',
    'payout_request.processed', 'payout.succeeded',
    'payout.failed', 'payout.processed',
    'payout.processing_failed', 'deposit.confirmed',
    'direct_transfer.received', 'legal_entity.verification_status_changed',
]


def envelope(name: str, obj: dict = None) -> str:
    """v2.* events use {event, payload}; payout and platform events use {type, data}."""
    obj = obj or {}
    body = {"event": name, "payload": obj} if name.startswith("v2.") else {"type": name, "data": obj}
    return json.dumps({"id": "evt_2xPq81", **body})


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (NextPay as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/nextpay",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("NEXTPAY_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_documented_event_count():
    assert len(set(EVENT_TYPES)) == 16


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_events(event_type):
    response = send(envelope(event_type, {"id": "obj_01J", "status": "completed"}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


@pytest.mark.parametrize("body,event_type", [
    ({"event": "v2.payment_intent.succeeded", "payload": {"id": "pi_1", "external_id": "order-98765", "amount": 150000}},
     "v2.payment_intent.succeeded"),
    ({"type": "payout_request.processed", "data": {"id": "pr_1", "amount_cents": 50000, "status": "completed"}},
     "payout_request.processed"),
])
def test_both_body_shapes(body, event_type):
    response = send(json.dumps(body))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_non_object_body():
    response = send("null")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_unknown_event_type():
    response = send(envelope("nextpay.something.new"))
    assert response.status_code == 200
    assert response.json()["type"] == "nextpay.something.new"


def test_any_content_type_verifies():
    response = send(envelope("payout.succeeded"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("v2.payment_intent.succeeded"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "v2.payment_intent.succeeded"}


def test_webhook_prefixed_invalid_signature():
    response = send(envelope("v2.payment_intent.succeeded"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = envelope("deposit.confirmed")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = envelope("deposit.confirmed")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/nextpay", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(envelope("payout.succeeded"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(envelope("payout.succeeded"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = envelope("payout.succeeded")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(envelope("payout.failed"), msg_id, timestamp)
    response = send(envelope("payout.succeeded"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(envelope("payout.succeeded"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("NEXTPAY_WEBHOOK_SECRET")
    assert send(envelope("payout.succeeded")).status_code == 500
