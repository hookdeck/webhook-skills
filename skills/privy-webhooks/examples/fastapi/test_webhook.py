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
    "privy.test": {"message": "Hello, World!"},
    "user.created": {"user": {"id": "did:privy:cm1"}},
    "user.authenticated": {"user": {"id": "did:privy:cm1"}},
    "user.linked_account": {"user": {"id": "did:privy:cm1"}},
    "user.unlinked_account": {"user": {"id": "did:privy:cm1"}},
    "user.wallet_created": {"user": {"id": "did:privy:cm1"}},
    "user.deleted": {"user": {"id": "did:privy:cm1"}},
    "mfa.enabled": {"user": {"id": "did:privy:cm1"}},
    "mfa.disabled": {"user": {"id": "did:privy:cm1"}},
    "wallet.funds_deposited": {"wallet_id": "w_01"},
    "wallet.funds_withdrawn": {"wallet_id": "w_01"},
    "wallet.private_key_export": {"wallet_id": "w_01"},
    "transaction.broadcasted": {"wallet_id": "w_01", "transaction_hash": "0xabc"},
    "transaction.confirmed": {"wallet_id": "w_01", "transaction_hash": "0xabc"},
    "transaction.failed": {"wallet_id": "w_01"},
    "transaction.execution_reverted": {"wallet_id": "w_01", "transaction_hash": "0xabc"},
    "wallet_action.swap.created": {"wallet_id": "w_01"},
    "wallet_action.swap.succeeded": {"wallet_id": "w_01"},
    "wallet_action.swap.failed": {"wallet_id": "w_01"},
    "intent.created": {"intent_id": "int_01"},
    "intent.executed": {"intent_id": "int_01"},
    "user_operation.completed": {"wallet_id": "w_01"},
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
    """prefix is 'svix' (Privy Cloud) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/privy",
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
    monkeypatch.setenv("PRIVY_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("type,data", list(EVENTS.items()))
def test_handles_events(type, data):
    response = send(json.dumps({"type": type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": type}


def test_unknown_type():
    response = send(json.dumps({"type": "privy.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "privy.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "transaction.confirmed", "wallet_id": "w_01"}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "transaction.confirmed", "wallet_id": "w_01"}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "transaction.confirmed"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"transaction.confirmed"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "user.created"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/privy", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"user.created"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"user.created"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"user.created"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"transaction.failed"}', msg_id, timestamp)
    response = send('{"type":"transaction.confirmed"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"user.created"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("PRIVY_WEBHOOK_SECRET")
    assert send('{"type":"user.created"}').status_code == 500
