import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-style secret: "whsec_" + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="
INVALID_SIG = "v1,aW52YWxpZF9zaWduYXR1cmU="

EVENT_TYPES = [
    "booking.created",
    "booking.updated",
    "payment.created",
    "payment.updated",
    "transaction.created",
    "transaction.updated",
    "trip.published",
    "lead.created",
    "lead.updated",
]

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("WETRAVEL_WEBHOOK_SECRET", TEST_SECRET)


def sign(payload: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """base64(HMAC_SHA256(base64decode(secret after whsec_), f"{id}.{ts}.{payload}"))"""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def body(event_type: str) -> str:
    return json.dumps({"type": event_type, "data": {"id": 12345}})


def post(payload: str, headers: dict):
    return client.post(
        "/webhooks/wetravel",
        content=payload,
        headers={"content-type": "application/json", **headers},
    )


def signed(payload: str, prefix: str = "svix", timestamp: str = None, signature: str = None):
    timestamp = timestamp or now()
    msg_id = "msg_" + secrets.token_hex(12)
    return post(
        payload,
        {
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, timestamp, msg_id),
        },
    )


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_valid_svix_headers():
    response = signed(body("booking.created"))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "booking.created"}


def test_webhook_header_aliases():
    response = signed(body("payment.created"), prefix="webhook")
    assert response.status_code == 200
    assert response.json()["type"] == "payment.created"


def test_multiple_signatures():
    payload, ts = body("booking.updated"), now()
    response = post(
        payload,
        {
            "svix-id": "msg_rotation",
            "svix-timestamp": ts,
            "svix-signature": f"{INVALID_SIG} {sign(payload, ts, 'msg_rotation')}",
        },
    )
    assert response.status_code == 200


def test_missing_headers():
    response = post(body("booking.created"), {})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = signed(body("booking.created"), signature=INVALID_SIG)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    ts = now()
    response = post(
        body("booking.updated"),
        {
            "svix-id": "msg_t",
            "svix-timestamp": ts,
            "svix-signature": sign(body("booking.created"), ts, "msg_t"),
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = signed(body("booking.created"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("WETRAVEL_WEBHOOK_SECRET")
    response = signed(body("booking.created"))
    assert response.status_code == 500


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_event_types(event_type):
    response = signed(body(event_type))
    assert response.status_code == 200
    assert response.json()["type"] == event_type


def test_unknown_event_type():
    response = signed(body("something.new"))
    assert response.status_code == 200
