import pytest
import json
import hmac
import hashlib
import base64
import time
from fastapi.testclient import TestClient
from main import app
import os
import secrets

# Test webhook secret
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

# Test client
client = TestClient(app)


def generate_clerk_signature(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """Generate valid Clerk/Svix signature."""
    signed_content = f"{msg_id}.{timestamp}.{payload}"
    secret_bytes = base64.b64decode(secret.split('_')[1])
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()
    return f"v1,{signature}"


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Set test environment variables."""
    monkeypatch.setenv("CLERK_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    """Test processing a valid webhook."""
    payload = {
        "data": {
            "id": "user_123",
            "email_addresses": [{
                "email_address": "test@example.com"
            }]
        },
        "object": "event",
        "type": "user.created",
        "instance_id": "ins_123",
        "timestamp": int(time.time() * 1000)
    }

    payload_str = json.dumps(payload)
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_clerk_signature(payload_str, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature
        }
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "user.created"}


def test_multiple_signatures():
    """Test handling multiple signatures (one valid, one invalid)."""
    payload = {
        "data": {"id": "user_123"},
        "object": "event",
        "type": "user.updated",
        "instance_id": "ins_123",
        "timestamp": int(time.time() * 1000)
    }

    payload_str = json.dumps(payload)
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    valid_signature = generate_clerk_signature(payload_str, TEST_SECRET, timestamp, msg_id)
    invalid_signature = "v1,aW52YWxpZF9zaWduYXR1cmU="

    # Send multiple signatures
    multi_signature = f"{invalid_signature} {valid_signature}"

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": multi_signature
        }
    )

    assert response.status_code == 200


def test_missing_headers():
    """Test rejection when headers are missing."""
    payload = {"data": {"id": "user_123"}, "type": "user.created"}

    response = client.post(
        "/webhooks/clerk",
        json=payload,
        headers={"content-type": "application/json"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required Svix headers"


def test_invalid_signature():
    """Test rejection of invalid signature."""
    payload = {
        "data": {"id": "user_123"},
        "object": "event",
        "type": "user.created"
    }

    payload_str = json.dumps(payload)
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": "v1,aW52YWxpZF9zaWduYXR1cmU="
        }
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    """Test rejection of old timestamps."""
    payload = {
        "data": {"id": "user_123"},
        "object": "event",
        "type": "user.created"
    }

    payload_str = json.dumps(payload)
    # Timestamp from 10 minutes ago
    old_timestamp = str(int(time.time()) - 600)
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_clerk_signature(payload_str, TEST_SECRET, old_timestamp, msg_id)

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": old_timestamp,
            "svix-signature": signature
        }
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


@pytest.mark.parametrize("event_type,extra_data", [
    ("user.created", {"email_addresses": [{"email_address": "test@example.com"}]}),
    ("user.updated", {}),
    ("user.deleted", {}),
    ("session.created", {"user_id": "user_123"}),
    ("session.ended", {"user_id": "user_123"}),
    ("organization.created", {"name": "Test Org"})
])
def test_common_event_types(event_type, extra_data):
    """Test handling of all common event types."""
    payload = {
        "data": {"id": "resource_123", **extra_data},
        "object": "event",
        "type": event_type,
        "instance_id": "ins_123",
        "timestamp": int(time.time() * 1000)
    }

    payload_str = json.dumps(payload)
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_clerk_signature(payload_str, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature
        }
    )

    assert response.status_code == 200
    assert response.json()["type"] == event_type


def test_unknown_event_type():
    """Test graceful handling of unknown event types."""
    payload = {
        "data": {"id": "resource_123"},
        "object": "event",
        "type": "unknown.event.type",
        "instance_id": "ins_123",
        "timestamp": int(time.time() * 1000)
    }

    payload_str = json.dumps(payload)
    timestamp = str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(16)
    signature = generate_clerk_signature(payload_str, TEST_SECRET, timestamp, msg_id)

    response = client.post(
        "/webhooks/clerk",
        content=payload_str,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature
        }
    )

    assert response.status_code == 200
    assert response.json()["type"] == "unknown.event.type"