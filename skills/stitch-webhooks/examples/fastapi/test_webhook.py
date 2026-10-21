import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are "whsec_" + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

# Payload shapes from https://docs.stitch.money/webhooks/types
PAYLOADS = {
    "payment": {
        "data": {"client": {"paymentInitiationRequests": {"node": {
            "__typename": "PaymentInitiationRequest",
            "id": "cGF5cmVxLzk2YjUy",
            "externalReference": "79261d16-c53b-48eb-9019-dc9cfb6c5126",
            "state": {"__typename": "PaymentInitiationRequestCompleted"},
            "paymentConfirmation": {"__typename": "PaymentPending"},
        }}}}
    },
    "payment-consent-request": {
        "id": "payment-consent-request:status:granted:abc",
        "type": "payment-consent-request",
        "datetime": "2023-05-10T12:22:42.865Z",
        "data": {"id": "cmVjdXJy", "status": "GRANTED", "type": "DEBICHECK"},
    },
    "transaction": {
        "id": "transaction:status:success:40431E69",
        "type": "transaction",
        "datetime": "2023-05-10T12:22:42.865Z",
        "data": {"id": "Y2FyZHRy", "status": "SUCCESS", "type": "CARD"},
    },
    "collection": {
        "id": "collection:status:completed:43986ec5",
        "type": "collection",
        "datetime": "2026-08-21T12:22:42.865Z",
        "data": {"id": "cGF5bWVu", "status": "completed"},
    },
    "refund": {
        "data": {"client": {"refunds": {"node": {
            "__typename": "Refund", "id": "cmVmdW5k", "status": {"__typename": "RefundCompleted"},
        }}}}
    },
    "disbursement": {
        "data": {"client": {"disbursements": {"node": {
            "__typename": "Disbursement", "id": "ZGlzYnVy",
            "status": {"__typename": "DisbursementCompleted"},
        }}}}
    },
}


def sign(payload: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """Sign exactly as Svix does: base64(HMAC_SHA256(b64decode(after whsec_), f"{id}.{ts}.{body}"))."""
    key = base64.b64decode(secret.split("_", 1)[1])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def new_msg_id() -> str:
    return "msg_" + secrets.token_hex(12)


def send(payload: str, timestamp: str = None, msg_id: str = None, signature: str = None):
    timestamp = timestamp or now()
    msg_id = msg_id or new_msg_id()
    return client.post(
        "/webhooks/stitch",
        content=payload,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, timestamp, msg_id),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("STITCH_WEBHOOK_SECRET", TEST_SECRET)


@pytest.mark.parametrize("event_type", list(PAYLOADS))
def test_accepts_signed_event(event_type):
    response = send(json.dumps(PAYLOADS[event_type]))
    assert response.status_code == 200
    assert response.json() == {"received": True, "type": event_type}


def test_signature_list_with_v2_and_rotated_entries():
    payload = json.dumps(PAYLOADS["transaction"])
    timestamp, msg_id = now(), new_msg_id()
    other = sign(payload, timestamp, msg_id, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    header = f"v2,MzJsNDk4MzI0K2VvdSMjMTEjQEBAQDEyMzMzMzEyMwo= {other} {sign(payload, timestamp, msg_id)}"
    response = send(payload, timestamp, msg_id, header)
    assert response.status_code == 200


def test_unknown_event_type():
    response = send(json.dumps({"type": "something-new", "data": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "something-new"


def test_missing_headers():
    response = client.post(
        "/webhooks/stitch",
        content=json.dumps(PAYLOADS["payment"]),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(
        json.dumps(PAYLOADS["payment"]),
        signature="v1,aW52YWxpZF9zaWduYXR1cmVfdmFsdWVfaGVyZV8xMjM0NTY=",
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = json.dumps(PAYLOADS["refund"])
    timestamp, msg_id = now(), new_msg_id()
    response = send(payload, timestamp, msg_id, sign(payload, timestamp, msg_id, "whsec_d3Jvbmdfc2VjcmV0"))
    assert response.status_code == 400


def test_tampered_body():
    payload = json.dumps(PAYLOADS["disbursement"])
    timestamp, msg_id = now(), new_msg_id()
    signature = sign(payload, timestamp, msg_id)
    tampered = payload.replace("DisbursementCompleted", "DisbursementReversed")
    response = send(tampered, timestamp, msg_id, signature)
    assert response.status_code == 400


def test_stale_timestamp():
    response = send(json.dumps(PAYLOADS["payment"]), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid timestamp"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("STITCH_WEBHOOK_SECRET")
    response = send(json.dumps(PAYLOADS["payment"]))
    assert response.status_code == 500


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
