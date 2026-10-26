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
    "onramp.awaiting_deposit", "onramp.funds_received", "onramp.processing", "onramp.success", "onramp.failed", "onramp.returned",
    "offramp.created", "offramp.funds_received", "offramp.processing", "offramp.success", "offramp.failed", "offramp.returned",
    "conversion.created", "conversion.funds_received", "conversion.processing", "conversion.success", "conversion.failed", "conversion.returned",
    "transfer.processing", "transfer.success", "transfer.failed",
    "deposit.received", "deposit.held", "deposit.confirmed", "deposit.failed",
    "kyc.approved", "kyc.rejected",
]


def envelope(event_type: str, obj: dict = None) -> str:
    """Every documented event arrives in GlobalStack's flat envelope."""
    obj = obj or {}
    return json.dumps({
        "event_id": "evt_1b8dbe64-1f4e-5a2c-9c31-6d9a51a0f0c2",
        "event_type": event_type,
        "event_category": event_type.split(".")[0],
        "event_developer_id": "int_01HXYZABC1234567890ABCDEFG",
        "api_version": "v1",
        "event_created_at": "2026-09-30T09:12:44.000Z",
        "event_object_id": obj.get("id", "con_01KPBH8MD6R7YDJ82T4D6M3V1T"),
        "event_object_status": obj.get("status", "success"),
        "event_object_changes": {"status": ["processing", "success"]},
        "event_object": obj,
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
    """prefix is 'svix' (GlobalStack as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/globalstack",
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
    monkeypatch.setenv("GLOBALSTACK_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_documented_event_count():
    assert len(set(EVENT_TYPES)) == 27


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_events(event_type):
    response = send(envelope(event_type, {"id": "obj_01J", "status": "success", "failure_reason": None}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(envelope("globalstack.something.new"))
    assert response.status_code == 200
    assert response.json()["type"] == "globalstack.something.new"


def test_any_content_type_verifies():
    response = send(envelope("conversion.success"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("onramp.success"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "onramp.success"}


def test_webhook_prefixed_invalid_signature():
    response = send(envelope("onramp.success"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
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
    response = client.post("/webhooks/globalstack", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(envelope("conversion.success"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(envelope("conversion.success"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = envelope("conversion.success")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(envelope("conversion.failed"), msg_id, timestamp)
    response = send(envelope("conversion.success"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(envelope("conversion.success"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("GLOBALSTACK_WEBHOOK_SECRET")
    assert send(envelope("conversion.success")).status_code == 500
