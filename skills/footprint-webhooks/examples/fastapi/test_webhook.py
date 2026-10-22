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
    "footprint.onboarding.completed": {"fp_id": "fp_id_xyz", "is_live": False, "onboarding_id": "ob_SRFT2a1mN7DAWJ0VPXkiqK", "requires_manual_review": False, "status": "pass"},
    "footprint.onboarding.incomplete": {"fp_id": "fp_id_xyz", "is_live": False, "onboarding_id": "ob_SRFT2a1mN7DAWJ0VPXkiqK"},
    "footprint.onboarding.status_changed": {"fp_id": "fp_id_xyz", "is_live": False, "new_status": "pass", "requires_manual_review": False},
    "footprint.watchlist_check.completed": {"error": None, "fp_id": "fp_id_xyz", "onboarding_id": "ob_SRFT2a1mN7DAWJ0VPXkiqK", "status": "pending"},
    "footprint.user.manual_review": {"fp_id": "fp_id_xyz", "is_live": False},
    "footprint.user.info_requested": {"fp_id": "fp_id_xyz", "is_live": False},
    "footprint.user.bank_link_updated": {"fp_id": "fp_id_xyz", "link_id": "bank_link_abcd1234", "link_state": "connected"},
    "footprint.vault.updated": {"fp_id": "fp_id_xyz", "fields": ["id.ssn9", "id.first_name"], "source": "dashboard"},
    "footprint.entity.entity_status_set": {"entity_kind": "person", "fp_id": "fp_id_xyz", "status": {"kind": "verification_status", "value": "verified"}},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None, content_type: str = "application/json"):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/footprint",
        content=payload,
        headers={
            "content-type": content_type,
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("FOOTPRINT_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_kind": event_type, "timestamp": "2024-06-14T02:40:00Z", **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_kind": "footprint.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "footprint.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_kind": "footprint.user.manual_review"}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_kind": "footprint.onboarding.completed"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/footprint", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_kind":"footprint.onboarding.completed"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = '{"event_kind":"footprint.onboarding.completed"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_kind":"footprint.onboarding.completed","status":"fail"}', msg_id, timestamp)
    response = send('{"event_kind":"footprint.onboarding.completed","status":"pass"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_kind":"footprint.onboarding.completed"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("FOOTPRINT_WEBHOOK_SECRET")
    assert send('{"event_kind":"footprint.onboarding.completed"}').status_code == 500
