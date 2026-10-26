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

PURCHASE = {
    "completed_at": "2025-05-15T12:24:04.097598Z",
    "description": "1 Minute Time Pass",
    "entitlement_status": { "content_key": "site.02acc452-e808-428f-8c64-0a5311d142bb", "expires": "2025-05-15T12:25:04.074314Z", "has_entitlement": True, "recurs_at": None },
    "id": "purchase.bc5a1f06-07a7-46af-8907-e3a79e7d7a78",
    "metadata": { "title": "Test Page", "url": "https://www.supertab.co/" },
    "offering_id": "offering.39e953e5-3b82-461e-bd7d-7b0c764e5b10",
    "price": { "amount": 25, "currency": { "base_unit": 100, "code": "USD", "name": "US Dollar", "symbol": "$" } },
    "purchased_at": "2025-05-15T12:24:04.074314Z",
    "user": { "email": "test@supertab.co", "first_name": "Test", "id": "user.9125c850-7fe2-4350-9b6a-52fe9ea844d5", "last_name": "User" },
  }

ONETIME_OFFERING = {
    "id": "onetime_offering.a3c0753a-2894-5cfb-8bba-976553b9fe42",
    "items": [
      {
        "description": "First item",
        "id": "onetime_offering_item.4f2be578-a7de-7b3e-a2a2-9c34cbcc585f",
        "metadata": { "action": "Promotions" },
        "price": { "amount": 2.99, "currency": { "base_unit": "100", "code": "USD", "name": "US Dollar", "symbol": "$" } },
      },
    ],
    "metadata": {},
    "price": { "amount": 2.99, "currency": { "base_unit": "100", "code": "USD", "name": "US Dollar", "symbol": "$" } },
    "status": "purchasing_completed",
  }

# Event names carry a version suffix; the handler also accepts the unversioned form that the
# catalog's own purchase.completed example uses
EVENTS = {
    "purchase.completed_2025-04-01": PURCHASE,
    "onetime_offering.purchasing_completed_2025-04-01": ONETIME_OFFERING,
    "purchase.completed": PURCHASE,
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
    """prefix is 'svix' (Supertab) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/supertab",
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
    monkeypatch.setenv("SUPERTAB_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"type": event_type, "data": data, "metadata": {}}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"type": "supertab.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "supertab.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "purchase.completed_2025-04-01", "data": PURCHASE}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "purchase.completed_2025-04-01", "data": PURCHASE}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "purchase.completed_2025-04-01"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"purchase.completed_2025-04-01"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "purchase.completed_2025-04-01"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/supertab", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"purchase.completed_2025-04-01"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"purchase.completed_2025-04-01"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"purchase.completed_2025-04-01"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"onetime_offering.purchasing_completed_2025-04-01"}', msg_id, timestamp)
    response = send('{"type":"purchase.completed_2025-04-01"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"purchase.completed_2025-04-01"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SUPERTAB_WEBHOOK_SECRET")
    assert send('{"type":"purchase.completed_2025-04-01"}').status_code == 500
