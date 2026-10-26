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
    "sync.pending", "sync.running", "sync.completed", "sync.failed", "sync.cancelled",
    "source_connection.created", "source_connection.auth_completed", "source_connection.deleted",
    "collection.created", "collection.updated", "collection.deleted",
]


def envelope(event_type: str) -> str:
    """Every documented event is a flat body: event_type, the ids for its domain, and timestamp."""
    return json.dumps({
        "event_type": event_type,
        "sync_id": "440e8400-e29b-41d4-a716-446655440099",
        "sync_job_id": "550e8400-e29b-41d4-a716-446655440000",
        "collection_id": "770e8400-e29b-41d4-a716-446655440002",
        "collection_readable_id": "finance-data-ab123",
        "collection_name": "Finance Data",
        "source_connection_id": "660e8400-e29b-41d4-a716-446655440001",
        "source_type": "notion",
        "timestamp": "2025-01-15T14:05:00Z",
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
    """prefix is 'svix' (Airweave as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/airweave",
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
    monkeypatch.setenv("AIRWEAVE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_documented_event_count():
    assert len(set(EVENT_TYPES)) == 11


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_events(event_type):
    response = send(envelope(event_type))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(envelope("airweave.something.new"))
    assert response.status_code == 200
    assert response.json()["type"] == "airweave.something.new"


def test_any_content_type_verifies():
    response = send(envelope("sync.completed"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("collection.created"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "collection.created"}


def test_webhook_prefixed_invalid_signature():
    response = send(envelope("collection.created"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = envelope("source_connection.auth_completed")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = envelope("source_connection.auth_completed")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/airweave", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(envelope("sync.completed"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(envelope("sync.completed"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = envelope("sync.completed")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(envelope("sync.failed"), msg_id, timestamp)
    response = send(envelope("sync.completed"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(envelope("sync.completed"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("AIRWEAVE_WEBHOOK_SECRET")
    assert send(envelope("sync.completed")).status_code == 500
