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

EVENTS = {
    "partner.created": {"id": "part_8fKq2LmZx7RtYw3nVbHc5dPj", "email": "sam@example.com", "status": "active"},
    "partner.updated": {"id": "part_8fKq2LmZx7RtYw3nVbHc5dPj", "status": "suspended"},
    "link.created": {"id": "link_3JkMn8QwLz5RtYb2NvHc7dPs", "value": "sam", "partner_id": "part_8fKq2LmZx7RtYw3nVbHc5dPj"},
    "link.updated": {"id": "link_3JkMn8QwLz5RtYb2NvHc7dPs", "value": "sam2"},
    "customer.created": {"id": "cus_4kLpQw9ZxRtYb3NvHc8LdFsJ", "partner_id": "part_8fKq2LmZx7RtYw3nVbHc5dPj", "status": "lead"},
    "customer.updated": {"id": "cus_4kLpQw9ZxRtYb3NvHc8LdFsJ", "status": "active"},
    "transaction.created": {"id": "txn_5MqRw9KxL2tZb8NvYc4HdFsJ", "amount": "4900", "currency": "usd", "status": "paid"},
    "transaction.updated": {"id": "txn_5MqRw9KxL2tZb8NvYc4HdFsJ", "status": "refunded"},
    "commission.created": {"id": "comm_7XqLm2KwR9tZb4NvHc8YdFsJ", "amount": "980", "revenue": "4900", "currency": "usd", "status": "pending", "partner_id": "part_8fKq2LmZx7RtYw3nVbHc5dPj"},
    "commission.updated": {"id": "comm_7XqLm2KwR9tZb4NvHc8YdFsJ", "status": "approved"},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Tolt) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/tolt",
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
    monkeypatch.setenv("TOLT_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"type": event_type, "data": data, "timestamp": "2026-08-24T14:25:41.000Z"}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"type": "tolt.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "tolt.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "commission.created", "data": {"id": "comm_01J"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "commission.created", "data": {"id": "comm_01J"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "commission.created"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"commission.created"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "transaction.created"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/tolt", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"transaction.created"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"transaction.created"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"transaction.created"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"commission.updated"}', msg_id, timestamp)
    response = send('{"type":"commission.created"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"transaction.created"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TOLT_WEBHOOK_SECRET")
    assert send('{"type":"transaction.created"}').status_code == 500
