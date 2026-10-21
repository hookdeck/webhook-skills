import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Test signing secret in the Svix default format: 'whsec_' + base64(key).
# base64 of "guesty_test_secret_key_123"
TEST_SECRET = "whsec_Z3Vlc3R5X3Rlc3Rfc2VjcmV0X2tleV8xMjM="

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("GUESTY_WEBHOOK_SECRET", TEST_SECRET)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Sign exactly as Svix does for Guesty:
    base64(HMAC_SHA256(base64decode(secret after whsec_), f"{id}.{timestamp}.{body}"))
    """
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def new_msg_id() -> str:
    return "msg_" + secrets.token_hex(12)


def signed_headers(payload: str, msg_id: str | None = None, timestamp: str | None = None,
                   signature: str | None = None) -> dict:
    msg_id = msg_id or new_msg_id()
    timestamp = timestamp or now()
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": signature or sign(payload, msg_id, timestamp),
    }


def send(payload: str, headers: dict):
    return client.post("/webhooks/guesty", content=payload, headers=headers)


RESERVATION_CREATED = {
    "event": "reservation.created.v2",
    "data": {
        "reservationId": "6a96ae8ea07eac3dcadf0aab",
        "accountId": "66053c21dd2adbdfb3b383b7",
        "status": "confirmed",
        "confirmationCode": "GY-pCCSraYC",
    },
    "meta": {
        "eventId": "b708e831-d9fc-44d5-b94a-3ff72a0ef815",
        "publishedAt": "2026-09-01T10:53:03.025Z",
    },
}


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_webhook():
    payload = json.dumps(RESERVATION_CREATED)
    response = send(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json() == {"received": True, "event": "reservation.created.v2"}


def test_multiple_signatures():
    """Secret rotation: accept the message if any v1 signature matches."""
    payload = json.dumps(RESERVATION_CREATED)
    msg_id, timestamp = new_msg_id(), now()
    valid = sign(payload, msg_id, timestamp)
    response = send(
        payload,
        signed_headers(payload, msg_id, timestamp, f"v1,aW52YWxpZF9zaWduYXR1cmU= {valid}"),
    )

    assert response.status_code == 200


def test_missing_headers():
    response = send(json.dumps(RESERVATION_CREATED), {"content-type": "application/json"})

    assert response.status_code == 400
    assert "Missing required webhook headers" in response.json()["detail"]


def test_invalid_signature():
    payload = json.dumps(RESERVATION_CREATED)
    response = send(payload, signed_headers(payload, signature="v1,aW52YWxpZF9zaWduYXR1cmU="))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = json.dumps(RESERVATION_CREATED)
    msg_id, timestamp = new_msg_id(), now()
    other_secret = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    response = send(
        payload,
        signed_headers(payload, msg_id, timestamp, sign(payload, msg_id, timestamp, other_secret)),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    payload = json.dumps(RESERVATION_CREATED)
    headers = signed_headers(payload)
    response = send(payload.replace("confirmed", "canceled"), headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_stale_timestamp():
    payload = json.dumps(RESERVATION_CREATED)
    old = str(int(time.time()) - 600)  # 10 minutes ago
    response = send(payload, signed_headers(payload, timestamp=old))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid timestamp"


@pytest.mark.parametrize(
    "event_name, body",
    [
        ("reservation.created.v2", {"data": {"reservationId": "r1"}, "meta": {"eventId": "e1"}}),
        ("reservation.updated.v2", {"data": {"reservationId": "r1"},
                                    "meta": {"eventId": "e2", "changedFields": ["notes"], "subType": "NOTES_ALTERED"}}),
        ("reservation.new", {"reservation": {"_id": "r1"}, "meta": {"eventId": "e3", "messageId": "m3"}}),
        ("reservation.updated", {"reservation": {"_id": "r1"}, "reservationBefore": {"_id": "r1"},
                                 "meta": {"eventId": "e4"}}),
        ("listing.new", {"listing": {"_id": "l1"}, "meta": {"eventId": "e5"}}),
        ("listing.updated", {"listing": {"_id": "l1"}, "meta": {"eventId": "e6"}}),
        ("listing.removed", {"listing": {"_id": "l1"}, "meta": {"eventId": "e7"}}),
        ("guest.created", {"guest": {"_id": "g1"}, "by": "user@example.com"}),
        ("payments.received", {"payment": {"reservationId": "r1", "amount": 190, "currency": "USD"}}),
    ],
)
def test_event_types(event_name, body):
    payload = json.dumps({"event": event_name, **body})
    response = send(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["event"] == event_name


def test_unknown_event():
    payload = json.dumps({"event": "task.created", "task": {"_id": "t1"}})
    response = send(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["event"] == "task.created"
