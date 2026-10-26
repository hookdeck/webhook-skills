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
    "lease.update": {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "start_date": "2024-01-01", "end_date": "2025-01-01", "rent": 1250, "notice_given": True},
    "task.create": {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "created", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
    "task.update": {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "in_progress", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
    "task.delete": {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "deleted", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
    "sms.respond": {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "sms", "company_id": "company_789", "human_handover_ind": False, "portfolio_external_ref": "property_oak_towers"},
    "email.respond": {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "email", "company_id": "company_789", "human_handover_ind": False, "portfolio_external_ref": "property_oak_towers"},
    "web_chat.respond": {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "website", "company_id": "company_789", "human_handover_ind": False, "portfolio_external_ref": "property_oak_towers"},
}


def envelope(event_type, body):
    return json.dumps({"event_type": event_type, "message_id": "51d155b3-496f-434e-b664-406836be35a0", "body": body})


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Travtus) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/travtus",
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
    monkeypatch.setenv("TRAVTUS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,body", list(EVENTS.items()))
def test_handles_events(event_type, body):
    response = send(envelope(event_type, body))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "travtus.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "travtus.something.new"


def test_any_content_type_verifies():
    response = send(envelope("task.update", EVENTS["task.update"]), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(envelope("task.update", EVENTS["task.update"]), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "task.update"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"task.update"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "task.update"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/travtus", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"task.update"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"task.update"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"task.update"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"task.delete"}', msg_id, timestamp)
    response = send('{"event_type":"task.update"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"task.update"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TRAVTUS_WEBHOOK_SECRET")
    assert send('{"event_type":"task.update"}').status_code == 500
