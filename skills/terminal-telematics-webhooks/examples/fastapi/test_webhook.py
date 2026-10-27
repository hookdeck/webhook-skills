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

CONN = {"id": "cnn_01J", "provider": {"code": "samsara", "name": "Samsara"}, "externalId": "acme"}

EVENTS = {
    "connection.created": {"connection": CONN},
    "connection.disconnected": {"connection": CONN},
    "connection.reconnected": {"connection": CONN},
    "connection.completed": {"connection": CONN, "metadata": {}},
    "connection.updated": {"connection": CONN},
    "connection.pending_deletion": {"connection": CONN},
    "connection.deleted": {"connection": CONN},
    "sync.requested": {"connection": CONN, "sync": {"id": "sync_01J", "status": "completed"}},
    "sync.started": {"connection": CONN, "sync": {"id": "sync_01J", "status": "completed"}},
    "sync.completed": {"connection": CONN, "sync": {"id": "sync_01J", "status": "completed"}},
    "sync.failed": {"connection": CONN, "sync": {"id": "sync_01J", "status": "failed", "failureReason": "provider_unavailable"}},
    "connection.first_sync_completed": {"connection": CONN, "sync": {"id": "sync_01J", "status": "completed"}},
    "delivery.requested": {"destination": {"id": "dest_01J", "type": "s3"}, "delivery": {"id": "dlv_01J", "status": "completed"}},
    "delivery.started": {"destination": {"id": "dest_01J", "type": "s3"}, "delivery": {"id": "dlv_01J", "status": "completed"}},
    "delivery.failed": {"destination": {"id": "dest_01J", "type": "s3"}, "delivery": {"id": "dlv_01J", "status": "completed"}},
    "delivery.completed": {"destination": {"id": "dest_01J", "type": "s3"}, "delivery": {"id": "dlv_01J", "status": "completed"}},
    "issue.reported": {"connection": CONN, "issue": {"id": "iss_01J", "status": "ongoing"}},
    "issue.resolved": {"connection": CONN, "issue": {"id": "iss_01J", "status": "ongoing"}},
    "provider.availability_updated": {"provider": {"code": "samsara", "name": "Samsara", "baseCode": "samsara"}, "availability": {"current": "degraded", "previous": "available"}, "update": {"impacted": [], "message": "Provider outage"}},
    "unsupported_provider.requested": {"contactEmail": "ops@example.com", "provider": "Acme Telematics"},
    "link.analytics_event_emitted": {},
    "vehicle.added": {"connection": CONN, "vehicle": {"id": "veh_01J", "status": "active"}},
    "vehicle.modified": {"connection": CONN, "vehicle": {"id": "veh_01J", "status": "active"}},
    "vehicle.removed": {"connection": CONN, "vehicle": {"id": "veh_01J", "status": "active"}},
    "driver.added": {"connection": CONN, "driver": {"id": "drv_01J"}},
    "driver.modified": {"connection": CONN, "driver": {"id": "drv_01J"}},
    "driver.removed": {"connection": CONN, "driver": {"id": "drv_01J"}},
    "trailer.added": {"connection": CONN, "trailer": {"id": "trl_01J"}},
    "trailer.modified": {"connection": CONN, "trailer": {"id": "trl_01J"}},
    "trailer.removed": {"connection": CONN, "trailer": {"id": "trl_01J"}},
    "safety_event.added": {"connection": CONN, "safetyEvent": {"id": "saf_01J", "type": "harsh_braking"}},
    "safety_event.modified": {"connection": CONN, "safetyEvent": {"id": "saf_01J", "type": "harsh_braking"}},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Svix's header names) or 'webhook' (the Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/terminal-telematics",
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
    monkeypatch.setenv("TERMINAL_TELEMATICS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"id": "evt_01J", "type": event_type, "detail": data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"id": "evt_01J", "type": "sync.something_new", "detail": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "sync.something_new"


def test_any_content_type_verifies():
    response = send(json.dumps({"id": "evt_01J", "type": "sync.completed", "detail": EVENTS["sync.completed"]}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"id": "evt_01J", "type": "sync.completed", "detail": EVENTS["sync.completed"]}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "sync.completed"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"sync.completed"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "sync.completed"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/terminal-telematics", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"sync.completed"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"sync.completed"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"sync.completed"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_rejects_a_signed_body_that_is_not_a_json_object():
    response = send("null")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"sync.failed"}', msg_id, timestamp)
    response = send('{"type":"sync.completed"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"sync.completed"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TERMINAL_TELEMATICS_WEBHOOK_SECRET")
    assert send('{"type":"sync.completed"}').status_code == 500
