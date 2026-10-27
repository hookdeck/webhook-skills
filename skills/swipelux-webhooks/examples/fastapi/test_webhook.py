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
    "customer.created": {"type": "individual"},
    "customer.updated": {"type": "individual"},
    "customer.archived": {"type": "individual"},
    "capability.created": {"status": "restricted"},
    "capability.status_changed": {"status": "ready"},
    "application.status_changed": {"status": "in_review"},
    "recipient.status_changed": {"status": "rejected"},
    "destination.status_changed": {"status": "ready"},
    "account.created": {"status": "ready"},
    "account.status_changed": {"status": "archived"},
    "account.details_changed": {"status": "ready"},
    "transfer.state_changed": {"state": "processing"},
}


def envelope(event_type: str, obj: dict = None, previous: dict = None) -> str:
    """v3 envelope: {id, type, createdAt, attempt, resource: {type, id}, data: {object, previous}}."""
    return json.dumps({
        "id": "evt_01J9ZQ3X7K",
        "type": event_type,
        "createdAt": "2026-10-26T10:15:30.000Z",
        "attempt": 1,
        "resource": {"type": event_type.split(".")[0], "id": "res_01J9ZQ3X7M"},
        "data": {"object": obj or {}, "previous": previous or {}},
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
    """prefix is 'svix' (Swipelux) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/swipelux",
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
    monkeypatch.setenv("SWIPELUX_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(envelope(event_type, data))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(envelope("swipelux.something.new"))
    assert response.status_code == 200
    assert response.json()["type"] == "swipelux.something.new"


def test_any_content_type_verifies():
    response = send(envelope("transfer.state_changed", {"state": "completed"}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("transfer.state_changed", {"state": "completed"}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "transfer.state_changed"}


def test_webhook_prefixed_invalid_signature():
    response = send(envelope("customer.created"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = envelope("customer.created")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/swipelux", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(envelope("customer.created"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(envelope("customer.created"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = envelope("customer.created")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(envelope("transfer.state_changed", {"state": "failed"}), msg_id, timestamp)
    response = send(envelope("customer.created"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(envelope("customer.created"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SWIPELUX_WEBHOOK_SECRET")
    assert send(envelope("customer.created")).status_code == 500
