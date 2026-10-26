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

def wallet(event_type):
    return {
        "id": "evt_1b2c3d",
        "type": event_type,
        "data": {"status": "succeeded", "token": {"symbol": "USDC", "amount": "10", "decimals": 6}},
    }


def order(event_type):
    return {"actionId": "7723139d-fba3-474d-8e52-0ac7512d5c7b", "type": event_type, "data": {"orderId": "7723139d", "phase": "payment"}}


def minting(event_type):
    return {
        "actionId": "a1b2",
        "startedAt": "2026-01-01T00:00:00Z",
        "completedAt": "2026-01-01T00:00:05Z",
        "type": event_type,
        "data": {},
        "resource": {},
    }


def credential(event_type):
    return {"id": "cred_1", "type": event_type, "data": {"credential": {"id": "cred_1"}}}


EVENTS = {
    "wallets.transfer.in": wallet("wallets.transfer.in"),
    "wallets.transfer.out": wallet("wallets.transfer.out"),
    "wallets.signer.exported": wallet("wallets.signer.exported"),
    "purchase.succeeded": {"type": "purchase.succeeded", "status": "success", "walletAddress": "0xabc", "txId": "tx1"},
    "orders.quote.created": order("orders.quote.created"),
    "orders.quote.updated": order("orders.quote.updated"),
    "orders.payment.succeeded": order("orders.payment.succeeded"),
    "orders.payment.failed": order("orders.payment.failed"),
    "orders.delivery.initiated": order("orders.delivery.initiated"),
    "orders.delivery.completed": order("orders.delivery.completed"),
    "orders.delivery.failed": order("orders.delivery.failed"),
    "collections.create.succeeded": minting("collections.create.succeeded"),
    "collections.update.succeeded": minting("collections.update.succeeded"),
    "nfts.create.succeeded": minting("nfts.create.succeeded"),
    "nfts.create.failed": minting("nfts.create.failed"),
    "nfts.update.succeeded": minting("nfts.update.succeeded"),
    "credential.creation.succeeded": credential("credential.creation.succeeded"),
    "credential.creation.failed": credential("credential.creation.failed"),
    "payment_methods.status.updated": {
        "id": "pm-status-1",
        "type": "payment_methods.status.updated",
        "data": {"status": "active"},
        "timestamp": "2026-01-01T00:00:00Z",
    },
}

SAMPLE = wallet("wallets.transfer.in")


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(
    payload: str,
    msg_id: str = None,
    timestamp: str = None,
    signature: str = None,
    content_type: str = "application/json",
    prefix: str = "svix",
):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    headers = {
        "content-type": content_type,
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": timestamp,
        f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
    }
    return client.post("/webhooks/crossmint", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("CROSSMINT_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,body", list(EVENTS.items()))
def test_handles_events(event_type, body):
    response = send(json.dumps(body))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_handles_unknown_event_types():
    response = send(json.dumps({"id": "evt_x", "type": "wallets.something_new", "data": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "wallets.something_new"


def test_accepts_verified_delivery_without_type_field():
    response = send(json.dumps({"id": "evt_x", "data": {}}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None}


def test_rejects_verified_body_that_is_not_a_json_object():
    response = send("[1, 2]")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_verifies_regardless_of_content_type():
    assert send(json.dumps(SAMPLE), content_type="application/octet-stream").status_code == 200


def test_accepts_webhook_prefixed_headers():
    response = send(json.dumps(SAMPLE), prefix="webhook")
    assert response.status_code == 200
    assert response.json()["type"] == "wallets.transfer.in"


def test_accepts_any_matching_signature_among_several():
    payload = json.dumps(SAMPLE)
    timestamp = now()
    signature = "v1,aW52YWxpZF9zaWduYXR1cmU= " + sign(payload, "msg_rotation", timestamp)
    assert send(payload, msg_id="msg_rotation", timestamp=timestamp, signature=signature).status_code == 200


def test_rejects_missing_headers():
    response = client.post("/webhooks/crossmint", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send(json.dumps(SAMPLE), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    payload = json.dumps(SAMPLE)
    timestamp = now()
    signature = sign(payload, "msg_other", timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id="msg_other", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_tampered_body():
    timestamp = now()
    signature = sign(json.dumps({**SAMPLE, "id": "evt_other"}), "msg_tamper", timestamp)
    response = send(json.dumps(SAMPLE), msg_id="msg_tamper", timestamp=timestamp, signature=signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_ignores_signature_versions_other_than_v1():
    payload = json.dumps(SAMPLE)
    timestamp = now()
    signature = sign(payload, "msg_v1a", timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id="msg_v1a", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_timestamp_older_than_five_minutes():
    response = send(json.dumps(SAMPLE), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_returns_500_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("CROSSMINT_WEBHOOK_SECRET")
    assert send(json.dumps(SAMPLE)).status_code == 500
