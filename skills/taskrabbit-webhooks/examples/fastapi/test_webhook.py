import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-style secret: 'whsec_' + base64 key. base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000"

# Example payloads from Taskrabbit's webhook docs
PAYLOADS = {
    "project.completed": {
        "event": "project.completed",
        "project_uuid": PROJECT_UUID,
        "timestamp": "2025-01-22T10:00:00Z",
        "agreement_external_reference": "REF-12345",
    },
    "project.canceled": {
        "event": "project.canceled",
        "project_uuid": PROJECT_UUID,
        "cancellation_reason": "order_canceled",
        "timestamp": "2025-01-22T10:00:00Z",
        "agreement_external_reference": "REF-12345",
    },
    "project.rescheduled": {
        "event": "project.rescheduled",
        "project_uuid": PROJECT_UUID,
        "new_start_time": "2025-06-15T09:15:00Z",
        "previous_start_time": "2025-06-15T07:00:00Z",
        "timestamp": "2025-06-15T09:15:00Z",
        "agreement_external_reference": "REF-12345",
    },
}

client = TestClient(app)


def generate_signature(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """HMAC-SHA256 over "<id>.<timestamp>.<raw body>", keyed with the base64-decoded
    bytes after "whsec_", base64-encoded and prefixed "v1,"."""
    key = base64.b64decode(secret.split("_", 1)[1])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def signed_headers(payload: str, timestamp: str = None) -> dict:
    ts = timestamp or str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(12)
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": generate_signature(payload, TEST_SECRET, ts, msg_id),
    }


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("TASKRABBIT_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    payload = json.dumps(PAYLOADS["project.completed"])
    response = client.post("/webhooks/taskrabbit", content=payload, headers=signed_headers(payload))

    assert response.status_code == 200
    assert response.json() == {"success": True, "event": "project.completed"}


@pytest.mark.parametrize("event_name", list(PAYLOADS))
def test_documented_events(event_name):
    payload = json.dumps(PAYLOADS[event_name])
    response = client.post("/webhooks/taskrabbit", content=payload, headers=signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["event"] == event_name


def test_webhook_header_aliases():
    payload = json.dumps(PAYLOADS["project.canceled"])
    h = signed_headers(payload)
    response = client.post(
        "/webhooks/taskrabbit",
        content=payload,
        headers={
            "content-type": "application/json",
            "webhook-id": h["svix-id"],
            "webhook-timestamp": h["svix-timestamp"],
            "webhook-signature": h["svix-signature"],
        },
    )

    assert response.status_code == 200


def test_multiple_signatures():
    """Secret rotation: accept the message if any signature matches."""
    payload = json.dumps(PAYLOADS["project.rescheduled"])
    h = signed_headers(payload)
    h["svix-signature"] = "v1,aW52YWxpZF9zaWduYXR1cmU= " + h["svix-signature"]
    response = client.post("/webhooks/taskrabbit", content=payload, headers=h)

    assert response.status_code == 200


def test_missing_headers():
    payload = json.dumps(PAYLOADS["project.completed"])
    response = client.post(
        "/webhooks/taskrabbit", content=payload, headers={"content-type": "application/json"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    payload = json.dumps(PAYLOADS["project.completed"])
    h = signed_headers(payload)
    h["svix-signature"] = "v1,aW52YWxpZF9zaWduYXR1cmU="
    response = client.post("/webhooks/taskrabbit", content=payload, headers=h)

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    payload = json.dumps(PAYLOADS["project.completed"])
    tampered = payload.replace("REF-12345", "REF-99999")
    response = client.post("/webhooks/taskrabbit", content=tampered, headers=signed_headers(payload))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    payload = json.dumps(PAYLOADS["project.completed"])
    old_timestamp = str(int(time.time()) - 600)  # 10 minutes ago
    response = client.post(
        "/webhooks/taskrabbit", content=payload, headers=signed_headers(payload, old_timestamp)
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_unknown_event():
    payload = json.dumps(
        {"event": "project.some_new_event", "project_uuid": PROJECT_UUID, "timestamp": "2025-01-22T10:00:00Z"}
    )
    response = client.post("/webhooks/taskrabbit", content=payload, headers=signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["event"] == "project.some_new_event"
