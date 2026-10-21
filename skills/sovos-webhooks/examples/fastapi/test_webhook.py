import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """Sign exactly as Svix does: base64(HMAC_SHA256(key, "id.timestamp.body"))."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def notification(event_type: str) -> str:
    return json.dumps(
        {
            "appPrefix": "DLT",
            "contentUrl": "https://uat-einvoicing-api-emea.sovos.com/download/api/v1/download/notification/abc",
            "correlationId": "822431a1-ef99-4ef7-8dfa-38f9c6b6b0af",
            "createdDate": 1770290583638,
            "eventType": event_type,
            "metadata": {
                "documentId": "4e9528cdc7cbe2e5444a70b9a4314bcb",
                "erpDocumentId": "#BC-UAT-MOCK582230",
                "erpSystemId": "TestSystemId",
                "processType": "0",
                "productId": "WA_SPARK__2.0",
                "sciCloudStatusCode": "100",
                "sciGovtStatusCode": None,
                "sciResponseCode": "IP",
                "sciStatusAction": "NOA",
            },
            "notificationId": "bd92d169-7ec0-4f21-a7eb-e2238070d9d7",
            "orgId": "faf412ed-bb3f-4e2c-9c7e-6bcf280e1ccf",
        }
    )


def now() -> str:
    return str(int(time.time()))


def signed_post(payload: str, timestamp: str | None = None, msg_id: str | None = None, signature: str | None = None):
    ts = timestamp or now()
    mid = msg_id or "msg_" + secrets.token_hex(12)
    return client.post(
        "/webhooks/sovos",
        content=payload,
        headers={
            "content-type": "application/json",
            "svix-id": mid,
            "svix-timestamp": ts,
            "svix-signature": signature or sign(payload, ts, mid),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("SOVOS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200


def test_valid_document_received():
    response = signed_post(notification("document.received"))
    assert response.status_code == 200
    assert response.json() == {"received": True, "eventType": "document.received"}


@pytest.mark.parametrize(
    "event_type", ["document.received", "document.completed", "workflow.completed", "system.error"]
)
def test_handles_documented_events(event_type):
    response = signed_post(notification(event_type))
    assert response.status_code == 200
    assert response.json()["eventType"] == event_type


def test_unknown_event_type():
    response = signed_post(notification("document.some_future_event"))
    assert response.status_code == 200


def test_multiple_signatures_secret_rotation():
    payload = notification("document.received")
    ts = now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, ts, 'msg_rotation')}"
    response = signed_post(payload, timestamp=ts, msg_id="msg_rotation", signature=signature)
    assert response.status_code == 200


def test_missing_headers():
    response = client.post(
        "/webhooks/sovos",
        content=notification("document.received"),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = signed_post(notification("document.received"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = notification("document.received")
    ts = now()
    other = "whsec_" + base64.b64encode(b"other_key").decode()
    response = signed_post(payload, timestamp=ts, msg_id="msg_1", signature=sign(payload, ts, "msg_1", other))
    assert response.status_code == 400


def test_tampered_body():
    payload = notification("document.received")
    ts = now()
    signature = sign(payload, ts, "msg_1")
    response = signed_post(payload.replace("IP", "AP"), timestamp=ts, msg_id="msg_1", signature=signature)
    assert response.status_code == 400


def test_old_timestamp():
    payload = notification("document.received")
    ts = str(int(time.time()) - 600)
    response = signed_post(payload, timestamp=ts, msg_id="msg_old", signature=sign(payload, ts, "msg_old"))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SOVOS_WEBHOOK_SECRET")
    response = signed_post(notification("document.received"))
    assert response.status_code == 500
