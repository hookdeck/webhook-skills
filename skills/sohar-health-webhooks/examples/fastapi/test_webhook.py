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

# The 10 documented event types
EVENTS = [
    "verification.updated", "sandbox.verification.updated",
    "verification.pending", "sandbox.verification.pending",
    "discovery.updated", "sandbox.discovery.updated",
    "flow.updated", "sandbox.flow.updated",
    "flow.callback", "sandbox.flow.callback",
]


def body(event: str, **extra) -> str:
    """Sohar Health's bodies are flat: `event` plus the resource id, `id` and `status` (documented examples)."""
    if "flow.callback" in event:
        base = {"event": event, "flowRunId": "990cdad8-1438-4bbd-8b55-120b56e87540",
                "input": {"type": "object", "properties": {"memberId": {"type": "string"}}}}
    elif "flow." in event:
        base = {"event": event, "flowRunId": "990cdad8-1438-4bbd-8b55-120b56e87540",
                "flowId": "33093874-1e3d-4ea9-b988-8cc64e5a4079", "status": "COMPLETE", "stateId": "create-verification"}
    elif "discovery." in event:
        base = {"event": event, "discoveryId": "fb701ac1-1246-4860-b1ec-bd916b97a990", "status": "complete", "id": "123456"}
    else:
        base = {"event": event, "verificationId": "990cdad8-1438-4bbd-8b55-120b56e87540", "id": "123456",
                "status": "pending" if "pending" in event else "complete.eligible"}
    return json.dumps({**base, **extra})


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Sohar Health as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/sohar-health",
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
    monkeypatch.setenv("SOHAR_HEALTH_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event", EVENTS)
def test_handles_events(event):
    response = send(body(event))
    assert response.status_code == 200
    assert response.json() == {"success": True, "event": event}


def test_unknown_event():
    response = send(body("something.new"))
    assert response.status_code == 200
    assert response.json()["event"] == "something.new"


def test_body_without_event_field():
    assert send("{}").status_code == 200


def test_any_content_type_verifies():
    response = send(body("verification.updated"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(body("verification.updated"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "event": "verification.updated"}


def test_webhook_prefixed_invalid_signature():
    response = send(body("verification.updated"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = body("flow.updated")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = body("flow.updated")
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/sohar-health", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(body("verification.updated"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(body("verification.updated"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = body("verification.updated")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(body("verification.pending"), msg_id, timestamp)
    response = send(body("verification.updated"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(body("verification.updated"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SOHAR_HEALTH_WEBHOOK_SECRET")
    assert send(body("verification.updated")).status_code == 500
