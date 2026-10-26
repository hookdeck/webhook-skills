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

# swap.status values from the swap lifecycle docs
STATUSES = ["user_transfer_pending", "ls_transfer_pending", "completed", "failed", "expired", "pending_refund", "refunded"]


def body(status: str, **swap) -> str:
    """Layerswap's body: {swap, quote, deposit_actions} (no event-type field; swap.status is the state)."""
    return json.dumps({
        "swap": {
            "id": "SWAP_ID",
            "status": status,
            "destination_address": "0x0000000000000000000000000000000000000001",
            "requested_amount": 100,
            "fail_reason": None,
            "metadata": {"reference_id": "your-external-id"},
            "transactions": [],
            **swap,
        },
        "quote": {"receive_amount": 99.5, "min_receive_amount": 99.0},
        "deposit_actions": [],
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


def test_body_without_swap_object():
    assert send("{}").status_code == 200


def test_any_content_type_verifies():
    response = send(body("completed"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(body("completed"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "status": "completed"}


def test_webhook_prefixed_invalid_signature():
    response = send(body("completed"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = body("refunded")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = body("refunded")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/layerswap", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(body("completed"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(body("completed"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = body("completed")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(body("failed"), msg_id, timestamp)
    response = send(body("completed"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(body("completed"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("LAYERSWAP_WEBHOOK_SECRET")
    assert send(body("completed")).status_code == 500
