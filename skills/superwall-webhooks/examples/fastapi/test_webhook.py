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

TYPES = [
    "initial_purchase", "renewal", "non_renewing_purchase", "product_change", "cancellation", "uncancellation",
    "refund", "billing_issue", "subscription_paused", "subscription_extended", "expiration", "transferred",
]
LEGACY_TYPES = [t for t in TYPES if t not in ("refund", "transferred", "subscription_extended")]


def v2_event(event_type: str, **event_data) -> dict:
    """V2 envelope (snake_case); `id` is evt_ + 32 hex and stays the same across redelivery."""
    return {
        "id": "evt_ea9c41ca861013812aa864e1807d5675",
        "api_version": "2026-09-22",
        "type": event_type,
        "occurred_at": 1750000000000,
        "project_id": "8712",
        "app_user_id": "user_1",
        "ordering_key": "8712/user_1",
        "is_family_share": False,
        "pointer_mismatch": False,
        "event_data": {"id": f"evt_abc:{event_type}", "name": event_type, "store": "APP_STORE", "environment": "PRODUCTION",
                       "product_id": "com.example.pro.monthly", "period_type": "NORMAL", "price": 9.99, "proceeds": 8.49, **event_data},
        "subscription": {"subscription_id": "otxn_1", "sequence": 1750000000000040, "state": "active", "is_active": True, "will_renew": True},
        "previous": None,
        "subscriber": {"app_user_id": "user_1", "original_app_user_id": "user_1", "aliases": ["user_1"], "identity_status": "resolved", "attributes": {}},
    }


def legacy_event(event_type: str, **data) -> dict:
    """Legacy body (camelCase) with the event facts under `data`."""
    return {
        "object": "event",
        "type": event_type,
        "projectId": 3827,
        "applicationId": 1,
        "timestamp": 1754067715103,
        "data": {"id": f"42fc6339-dc28-470b-a0fa-0d13c92d8b61:{event_type}", "name": event_type, "periodType": "NORMAL",
                 "price": 9.99, "productId": "com.example.premium.monthly", "store": "APP_STORE", **data},
    }


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix", extra_headers: dict = None):
    """prefix is 'svix' (Superwall) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/superwall",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
            **(extra_headers or {}),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("SUPERWALL_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type", TYPES)
def test_handles_v2_events(event_type):
    response = send(json.dumps(v2_event(event_type)), extra_headers={"superwall_version": "2"})
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


@pytest.mark.parametrize("event_type", LEGACY_TYPES)
def test_handles_legacy_events(event_type):
    response = send(json.dumps(legacy_event(event_type)), extra_headers={"superwall_version": "1"})
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_legacy_detected_by_body_shape_without_version_header():
    response = send(json.dumps(legacy_event("renewal", isTrialConversion=True)))
    assert response.status_code == 200
    assert response.json()["type"] == "renewal"


def test_v2_event_with_unknown_owner():
    body = {**v2_event("renewal"), "app_user_id": None, "subscription": None, "subscriber": None}
    assert send(json.dumps(body)).status_code == 200


def test_unknown_event_type():
    response = send(json.dumps({"type": "superwall.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "superwall.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps(v2_event("renewal")), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps(v2_event("renewal")), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "renewal"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"renewal"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "renewal"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/superwall", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"renewal"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"renewal"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"renewal"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"refund"}', msg_id, timestamp)
    response = send('{"type":"renewal"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"renewal"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SUPERWALL_WEBHOOK_SECRET")
    assert send('{"type":"renewal"}').status_code == 500
