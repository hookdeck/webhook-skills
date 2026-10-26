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

ALERT = {
    "alertId": "al_genericId123",
    "alertType": "FRAUD",
    "amount": 500.0,
    "attributes": {"order_number": "#1533"},
    "arn": "12345678901234567890123",
    "authCode": "ABC123",
    "card": "123456xxxxxxx7890",
    "cardBrand": "visa",
    "createdAt": "2024-10-31 21:57:23.601000Z",
    "currency": "usd",
    "customerEmail": "customer@example.com",
    "id": "al_genericId123",
    "merchantId": "cb_genericMerchantId",
    "provider": "exampleProvider",
    "subprovider": "Ethoca",
    "transactionDate": "2024-09-30 00:00:00.000000Z",
}

DEFLECTION = {
    "id": "def_4xUCdBXVs23u03i51cpQBJ",
    "type": "CE",
    "status": "Succeeded",
    "amount": 49.99,
    "currency": "USD",
    "chargeId": "ch_0ab931c9139b0c8519c",
    "customerEmail": "customer@example.com",
    "fees": 0.75,
    "merchantId": "cb_genericMerchantId",
}

EVENTS = {
    "alert.created": ALERT,
    "alert.updated": ALERT,
    "alert.refunded": ALERT,
    "alert.matched": ALERT,
    "alert.will_expire": ALERT,
    "alert.within_refund_rules": ALERT,
    "deflection.created": DEFLECTION,
    "deflection.updated": DEFLECTION,
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(
    payload: str,
    msg_id: str = None,
    timestamp: str = None,
    signature: str = None,
    content_type: str = "application/json",
    event_type: str = "alert.created",
    prefix: str = "svix",
):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    headers = {
        "content-type": content_type,
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": timestamp,
        f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
    }
    if event_type:
        headers["x-event-type"] = event_type
    return client.post("/webhooks/chargeblast", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("CHARGEBLAST_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,body", list(EVENTS.items()))
def test_handles_events(event_type, body):
    response = send(json.dumps(body), event_type=event_type)
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_handles_unknown_event_types():
    response = send(json.dumps(ALERT), event_type="alert.something_new")
    assert response.status_code == 200
    assert response.json()["type"] == "alert.something_new"


def test_accepts_verified_delivery_without_event_type_header():
    response = send(json.dumps(ALERT), event_type=None)
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None}


def test_verifies_regardless_of_content_type():
    assert send(json.dumps(ALERT), content_type="application/octet-stream").status_code == 200


def test_accepts_webhook_prefixed_headers():
    response = send(json.dumps(ALERT), prefix="webhook", event_type="alert.updated")
    assert response.status_code == 200
    assert response.json()["type"] == "alert.updated"


def test_accepts_any_matching_signature_among_several():
    payload = json.dumps(ALERT)
    timestamp = now()
    signature = "v1,aW52YWxpZF9zaWduYXR1cmU= " + sign(payload, "msg_rotation", timestamp)
    assert send(payload, msg_id="msg_rotation", timestamp=timestamp, signature=signature).status_code == 200


def test_rejects_missing_headers():
    response = client.post("/webhooks/chargeblast", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send(json.dumps(ALERT), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    payload = json.dumps(ALERT)
    timestamp = now()
    signature = sign(payload, "msg_other", timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id="msg_other", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_tampered_body():
    timestamp = now()
    signature = sign(json.dumps({**ALERT, "amount": 5.0}), "msg_tamper", timestamp)
    response = send(json.dumps(ALERT), msg_id="msg_tamper", timestamp=timestamp, signature=signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_ignores_signature_versions_other_than_v1():
    payload = json.dumps(ALERT)
    timestamp = now()
    signature = sign(payload, "msg_v1a", timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id="msg_v1a", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_timestamp_older_than_five_minutes():
    response = send(json.dumps(ALERT), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_returns_500_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("CHARGEBLAST_WEBHOOK_SECRET")
    assert send(json.dumps(ALERT)).status_code == 500
