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

# Webhook `status` values (PascalCase) from Layerswap's Webhooks page
STATUSES = ["PendingDeposit", "PendingWithdrawal", "Completed", "Failed", "Expired", "PendingRefund", "Refunded"]


def body(status: str, **fields) -> str:
    """Layerswap's documented example body: a flat swap object (no event-type field; `status` is the state)."""
    return json.dumps({
        "id": "SWAP_ID",
        "from": "ETHEREUM_MAINNET",
        "to": "BASE_MAINNET",
        "fee": 0.5,
        "source_address": None,
        "deposit_address": "0x...",
        "status": status,
        "app_name": "YOUR_APP_CLIENT_ID",
        "is_testnet": False,
        "amount": 100,
        "to_address": "0x...",
        "reference_id": "your-external-id",
        "transactions": [],
        "timestamp": 1793577600000,
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
    """prefix is 'svix' (Layerswap as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/layerswap",
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
    monkeypatch.setenv("LAYERSWAP_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("status", STATUSES)
def test_handles_swap_statuses(status):
    response = send(body(status))
    assert response.status_code == 200
    assert response.json() == {"success": True, "status": status}


def test_unknown_status():
    response = send(body("something_new"))
    assert response.status_code == 200
    assert response.json()["status"] == "something_new"


def test_body_without_status():
    assert send("{}").status_code == 200


def test_any_content_type_verifies():
    response = send(body("Completed"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(body("Completed"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "status": "Completed"}


def test_webhook_prefixed_invalid_signature():
    response = send(body("Completed"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = body("Refunded")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = body("Refunded")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/layerswap", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(body("Completed"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(body("Completed"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = body("Completed")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(body("Failed"), msg_id, timestamp)
    response = send(body("Completed"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(body("Completed"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("LAYERSWAP_WEBHOOK_SECRET")
    assert send(body("Completed")).status_code == 500
