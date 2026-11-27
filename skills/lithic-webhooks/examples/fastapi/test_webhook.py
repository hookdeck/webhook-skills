import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment before importing the app.
# Lithic secrets are 'whsec_' + a base64-encoded key. Throwaway test key.
os.environ["LITHIC_WEBHOOK_SECRET"] = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
os.environ["LITHIC_API_KEY"] = "test-api-key"

from main import app  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["LITHIC_WEBHOOK_SECRET"]

EVENT_TYPES = [
    "card.created",
    "card.updated",
    "card_transaction.updated",
    "payment_transaction.created",
    "payment_transaction.updated",
    "dispute.updated",
    "balance.updated",
    "three_ds_authentication.created",
    "account_holder.created",  # unhandled -> still 200
]


def sign_payload(payload: str, secret: str = WEBHOOK_SECRET, timestamp: int | None = None):
    """Generate a valid Lithic (Standard Webhooks) signature for testing.

    Signed content is `{webhook-id}.{webhook-timestamp}.{payload}` and the HMAC
    key is the base64-decoded portion of the secret after the `whsec_` prefix.
    """
    if timestamp is None:
        timestamp = int(time.time())
    msg_id = "msg_test_123"
    key = base64.b64decode(secret.split("_", 1)[1])
    signed_content = f"{msg_id}.{timestamp}.{payload}".encode("utf-8")
    signature = base64.b64encode(
        hmac.new(key, signed_content, hashlib.sha256).digest()
    ).decode("utf-8")
    return {
        "Content-Type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": str(timestamp),
        "webhook-signature": f"v1,{signature}",
    }


def test_missing_signature_returns_400():
    response = client.post(
        "/webhooks/lithic",
        content="{}",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert "Invalid signature" in response.json()["detail"]


def test_invalid_signature_returns_400():
    payload = json.dumps({"token": "evt_1", "event_type": "card.created"})
    response = client.post(
        "/webhooks/lithic",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "webhook-id": "msg_1",
            "webhook-timestamp": str(int(time.time())),
            "webhook-signature": "v1,invalidsignature",
        },
    )
    assert response.status_code == 400


def test_tampered_payload_returns_400():
    original = json.dumps({"token": "evt_1", "event_type": "card.created", "amount": 100})
    headers = sign_payload(original)
    tampered = json.dumps({"token": "evt_1", "event_type": "card.created", "amount": 999})

    response = client.post("/webhooks/lithic", content=tampered, headers=headers)
    assert response.status_code == 400


def test_stale_timestamp_returns_400():
    payload = json.dumps({"token": "evt_1", "event_type": "card.created"})
    stale_ts = int(time.time()) - 600  # 10 minutes ago
    headers = sign_payload(payload, WEBHOOK_SECRET, stale_ts)

    response = client.post("/webhooks/lithic", content=payload, headers=headers)
    assert response.status_code == 400


def test_valid_signature_returns_200():
    payload = json.dumps(
        {
            "event_type": "card.created",
            "card_token": "00000000-0000-0000-0000-000000000001",
            "replacement_for": None,
        }
    )
    headers = sign_payload(payload)

    response = client.post("/webhooks/lithic", content=payload, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"received": True}


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_event_types(event_type: str):
    payload = json.dumps(
        {
            "event_type": event_type,
            "token": "obj_1",
        }
    )
    headers = sign_payload(payload)

    response = client.post("/webhooks/lithic", content=payload, headers=headers)
    assert response.status_code == 200, f"Failed for event type: {event_type}"


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
