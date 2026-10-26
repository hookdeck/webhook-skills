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

# The 26 event types from the BlindPay event catalog
EVENTS = [
    "customer.new",
    "customer.update",
    "customer.delete",
    "bankAccount.new",
    "blockchainWallet.new",
    "blockchainWallet.update",
    "tos.accept",
    "payin.new",
    "payin.update",
    "payin.complete",
    "payout.new",
    "payout.update",
    "payout.complete",
    "virtualAccount.new",
    "virtualAccount.complete",
    "transfer.new",
    "transfer.update",
    "transfer.complete",
    "wallet.new",
    "wallet.update",
    "wallet.inbound",
    "limitIncrease.new",
    "limitIncrease.update",
    "payable.new",
    "payable.update",
    "payable.complete",
]


def body(event: str, **fields) -> str:
    """BlindPay's body is flat: `webhook_event` followed by the resource's own fields."""
    return json.dumps({
        "webhook_event": event,
        "id": "pi_000000000000",
        "status": "completed",
        "customer_id": "re_000000000000",
        "receiver_amount": 10000,
        "sender_amount": 10000,
        "payment_method": "ach",
        **fields,
    })


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (BlindPay as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/blindpay",
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
    monkeypatch.setenv("BLINDPAY_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event", EVENTS)
def test_handles_events(event):
    response = send(body(event))
    assert response.status_code == 200
    assert response.json() == {"success": True, "event": event}


def test_unknown_event():
    response = send(body("something.new"))
    assert response.status_code == 200
    assert response.json()["event"] == "something.new"


def test_body_without_webhook_event():
    assert send("{}").status_code == 200


def test_any_content_type_verifies():
    response = send(body("payin.complete"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(body("payin.complete"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "event": "payin.complete"}


def test_webhook_prefixed_invalid_signature():
    response = send(body("payin.complete"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = body("payout.complete")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = body("payout.complete")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/blindpay", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(body("payin.complete"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(body("payin.complete"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = body("payin.complete")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(body("payin.new"), msg_id, timestamp)
    response = send(body("payin.complete"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(body("payin.complete"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_body_that_is_not_a_json_object():
    response = send("null")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("BLINDPAY_WEBHOOK_SECRET")
    assert send(body("payin.complete")).status_code == 500
