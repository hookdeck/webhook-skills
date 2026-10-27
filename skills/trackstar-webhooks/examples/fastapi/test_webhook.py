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
    "connection.created": {"connection_id": "conn_01", "integration_name": "ShipBob", "data": {"id": "conn_01"}},
    "connection.deleted": {"connection_id": "conn_01", "data": {"id": "conn_01"}},
    "connection.historical-sync-completed": {"connection_id": "conn_01", "data": {"resource": "orders"}},
    "connection.sync-job-stuck": {"connection_id": "conn_01", "data": {}},
    "connection-error.created": {"connection_id": "conn_01", "data": {"id": "err_01"}},
    "install.failed": {"integration_name": "ShipBob", "data": {}},
    "order.created": {"connection_id": "conn_01", "data": {"id": "ord_01", "status": "open"}},
    "order.updated": {"connection_id": "conn_01", "data": {"id": "ord_01", "status": "shipped"}, "previous_attributes": {"status": "open"}},
    "order.shipment.created": {"connection_id": "conn_01", "data": {"id": "shp_01"}},
    "inventory.updated": {"connection_id": "conn_01", "data": {"id": "inv_01"}, "previous_attributes": {"locations.0.onhand": 3}},
    "inbound-shipment.updated": {"connection_id": "conn_01", "data": {"id": "ibs_01", "status": "received"}, "previous_attributes": {"status": "open"}},
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
    """prefix is 'svix' (Trackstar) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/trackstar",
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
    monkeypatch.setenv("TRACKSTAR_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "inbound-shipment.receipt.created"}))
    assert response.status_code == 200
    assert response.json()["type"] == "inbound-shipment.receipt.created"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "order.created", "data": {"id": "ord_01"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event_type": "order.created", "data": {"id": "ord_01"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "order.created"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"order.created"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "order.updated"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/trackstar", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"order.updated"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"order.updated"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"order.updated"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"order.shipment.created"}', msg_id, timestamp)
    response = send('{"event_type":"order.created"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"order.updated"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TRACKSTAR_WEBHOOK_SECRET")
    assert send('{"event_type":"order.updated"}').status_code == 500
