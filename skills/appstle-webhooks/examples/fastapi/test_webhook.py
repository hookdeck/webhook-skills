import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Appstle (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None, headers: dict = None):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        }
    return client.post(
        "/webhooks/appstle",
        content=payload,
        headers={"content-type": "application/json", **headers},
    )


SUBSCRIPTION = {"id": "gid://shopify/SubscriptionContract/12345", "status": "ACTIVE", "customer": {"email": "a@example.com"}}
BILLING_ATTEMPT = {"id": 98765, "shop": "example-store.myshopify.com", "contractId": 12345, "status": "SUCCESS"}


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("APPSTLE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "event_type,data",
    [
        ("subscription.created", SUBSCRIPTION),
        ("subscription.updated", SUBSCRIPTION),
        ("subscription.activated", SUBSCRIPTION),
        ("subscription.paused", SUBSCRIPTION),
        ("subscription.cancelled", SUBSCRIPTION),
        ("subscription.next-order-date-changed", SUBSCRIPTION),
        ("subscription.billing-interval-changed", SUBSCRIPTION),
        ("subscription.billing-success", BILLING_ATTEMPT),
        ("subscription.billing-failure", {**BILLING_ATTEMPT, "status": "FAILURE"}),
        ("subscription.billing-skipped", {**BILLING_ATTEMPT, "status": "SKIPPED"}),
        ("subscription.upcoming-order-notification", BILLING_ATTEMPT),
    ],
)
def test_handles_events(event_type, data):
    response = send(json.dumps({"type": event_type, "data": data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type_is_accepted():
    response = send(json.dumps({"type": "subscription.something-new", "data": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "subscription.something-new"


def test_accepts_any_matching_signature_among_several():
    payload = json.dumps({"type": "subscription.paused", "data": SUBSCRIPTION})
    msg_id, timestamp = "msg_rotation", now()
    signature = "v1,aW52YWxpZF9zaWduYXR1cmU= " + sign(payload, msg_id, timestamp)
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_rejects_missing_headers():
    response = send("{}", headers={})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send('{"type":"subscription.created"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    payload = '{"type":"subscription.created"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_rejects_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"subscription.created"}', msg_id, timestamp)
    response = send('{"type":"subscription.cancelled"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_stale_timestamp():
    payload = '{"type":"subscription.created"}'
    msg_id, timestamp = "msg_stale", str(int(time.time()) - 3600)
    response = send(payload, msg_id, timestamp, sign(payload, msg_id, timestamp))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_rejects_valid_signature_over_invalid_json():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("APPSTLE_WEBHOOK_SECRET")
    assert send("{}").status_code == 500
