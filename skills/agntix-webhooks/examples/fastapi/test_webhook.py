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
    "session.created": {},
    "session.ended": {
        "lastActivityAt": "2026-04-08T05:00:09.000Z",
        "endedAt": "2026-04-08T05:00:10.546Z",
        "analysis": {"summary": "Customer confirmed delivery slot.", "extractedData": {"slotConfirmed": True}},
        "recordingUrl": "https://app.agntix.ai/en/logs-history?opened=4981804c-2658-4893-84ff-9c2fa90fb3c2",
    },
}


def envelope(event_type: str, extra: dict = None) -> str:
    """Flat envelope (no `data`): `eventType` is the event name, `type` is the session kind (VOICE | CHAT)."""
    return json.dumps({
        "id": "4981804c-2658-4893-84ff-9c2fa90fb3c2",
        "eventType": event_type,
        "type": "VOICE",
        "platform": "PHONE",
        "direction": "OUTBOUND",
        "state": "CLOSED" if event_type == "session.ended" else "OPEN",
        "agentId": "40235145-aa3d-443e-9d0c-841dd0716a2f",
        "createdAt": "2026-04-08T05:00:01.130Z",
        "metadata": {"customerPhoneNumber": "+971501234567", "sessionVariables": {"crmContactId": "CRM-7728"}},
        **(extra or {}),
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
    """prefix is 'svix' (Agntix) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/agntix",
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
    monkeypatch.setenv("AGNTIX_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,extra", list(EVENTS.items()))
def test_handles_events(event_type, extra):
    response = send(envelope(event_type, extra))
    assert response.status_code == 200
    assert response.json() == {"success": True, "eventType": event_type}


def test_unknown_event_type():
    response = send(envelope("session.updated"))
    assert response.status_code == 200
    assert response.json()["eventType"] == "session.updated"


def test_any_content_type_verifies():
    response = send(envelope("session.ended"), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("session.ended"), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "eventType": "session.ended"}


def test_webhook_prefixed_invalid_signature():
    response = send(envelope("session.created"), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = envelope("session.created")
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/agntix", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(envelope("session.created"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(envelope("session.created"), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = envelope("session.created")
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(envelope("session.ended", {"endedAt": "2026-04-08T05:00:10.546Z"}), msg_id, timestamp)
    response = send(envelope("session.created"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(envelope("session.created"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("AGNTIX_WEBHOOK_SECRET")
    assert send(envelope("session.created")).status_code == 500
