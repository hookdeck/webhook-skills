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

ENVELOPE = {"team_id": "team_1", "user_id": "user_1", "client_user_id": "client_1"}

EVENTS = {
    "provider.connection.created": {"source": {"name": "Strava", "slug": "strava", "logo": "https://example.com/strava.png"}, "user_id": "user_1"},
    "provider.connection.error": {"user_id": "user_1"},
    "provider.device.created": {"user_id": "user_1"},
    "provider.device.updated": {"user_id": "user_1"},
    "daily.data.activity.created": {"id": "act_1", "steps": 1496, "source": {"name": "Apple HealthKit", "slug": "apple_health_kit"}, "user_id": "user_1"},
    "daily.data.activity.updated": {"id": "act_1", "steps": 2100, "source": {"name": "Apple HealthKit", "slug": "apple_health_kit"}, "user_id": "user_1"},
    "daily.data.sleep.created": {"id": "sleep_1", "source": {"name": "Oura", "slug": "oura"}, "user_id": "user_1"},
    "daily.data.sleep_cycle.updated": {"id": "cycle_1", "source": {"name": "Oura", "slug": "oura"}, "user_id": "user_1"},
    "daily.data.workouts.created": {"id": "wo_1", "calories": 4470, "source": {"name": "Zwift", "slug": "zwift"}, "user_id": "user_1"},
    "daily.data.steps.created": {"data": [{"timestamp": "2023-05-16T10:00:00+00:00", "unit": "count", "value": 237}], "source_id": 16, "source": {"name": "Fitbit", "slug": "fitbit"}, "user_id": "user_1"},
    "daily.data.glucose.updated": {"data": [{"timestamp": "2023-05-16T10:00:00+00:00", "unit": "mg/dL", "value": 98}], "source_id": 3, "source": {"name": "Freestyle Libre", "slug": "freestyle_libre_ble"}, "user_id": "user_1"},
    "historical.data.workouts.created": {"user_id": "user_1", "start_date": "2020-06-21T08:23:01+00:00", "end_date": "2024-11-02T14:39:28+00:00", "provider": "zwift"},
    "historical.data.sleep.created": {"user_id": "user_1", "start_date": "2020-06-21T08:23:01+00:00", "end_date": "2024-11-02T14:39:28+00:00", "provider": "oura"},
    "labtest.order.created": {"id": "order_1"},
    "labtest.order.updated": {"id": "order_1"},
    "labtest.appointment.created": {"id": "appt_1"},
    "labtest.appointment.updated": {"id": "appt_1"},
    "labtest.result.critical": {"id": "order_1"},
    "continuous_query.result_table.changed": {},
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
    """prefix is 'svix' (Junction) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/junction",
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
    monkeypatch.setenv("JUNCTION_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, "data": data, **ENVELOPE}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "junction.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "junction.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "daily.data.sleep.created", "data": {"id": "sleep_1"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event_type": "daily.data.sleep.created", "data": {"id": "sleep_1"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "daily.data.sleep.created"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"daily.data.sleep.created"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "provider.connection.created"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/junction", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"provider.connection.created"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"provider.connection.created"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"provider.connection.created"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"daily.data.sleep.updated"}', msg_id, timestamp)
    response = send('{"event_type":"daily.data.sleep.created"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"provider.connection.created"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("JUNCTION_WEBHOOK_SECRET")
    assert send('{"event_type":"provider.connection.created"}').status_code == 500
