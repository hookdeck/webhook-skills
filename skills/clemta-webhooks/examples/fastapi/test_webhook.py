import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

EVENT_TYPES = [
    "company.created", "company.status.changed", "company.verified", "company.incorporated",
    "company.onboarding.completed", "company.name.changed", "company.ein.assigned",
    "company.document.received", "company.entitlements.changed", "company.updated", "company.dissolved",
    "tax_filing.created", "tax_filing.status.changed",
    "service_order.status.changed", "service_order.completed", "service_order.updated",
    "service_order.quoted", "service_order.renewal_canceled", "service_order.renewal_cancel_denied",
    "requirement.created", "requirement.fulfilled", "requirement.canceled",
    "requirement.signature.viewed", "requirement.signature.signed",
    "file.created", "calendar.reminder", "invoice.finalized",
]


def body(event_type: str) -> str:
    return json.dumps(
        {"type": event_type, "data": {"object": {"object": event_type.split(".")[0], "id": "cmp_123", "status": "active"}}}
    )


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
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
    prefix: str = "webhook",
):
    msg_id = msg_id or "evt_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    headers = {
        "content-type": content_type,
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": timestamp,
        f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
    }
    return client.post("/webhooks/clemta", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("CLEMTA_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_events(event_type):
    response = send(body(event_type))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_handles_unknown_event_types():
    response = send(body("company.something_new"))
    assert response.status_code == 200
    assert response.json()["type"] == "company.something_new"


def test_verifies_regardless_of_content_type():
    assert send(body("company.created"), content_type="application/octet-stream").status_code == 200


def test_accepts_svix_prefixed_headers():
    response = send(body("company.created"), prefix="svix")
    assert response.status_code == 200
    assert response.json()["type"] == "company.created"


def test_accepts_any_matching_v1_signature_among_several():
    payload = body("company.created")
    msg_id, ts = "evt_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, ts)}"
    assert send(payload, msg_id=msg_id, timestamp=ts, signature=signature).status_code == 200


def test_skips_the_v1a_entry_sent_beside_v1():
    payload = body("company.created")
    msg_id, ts = "evt_v1a", now()
    signature = f"{sign(payload, msg_id, ts)} v1a,{base64.b64encode(bytes([1]) * 64).decode()}"
    assert send(payload, msg_id=msg_id, timestamp=ts, signature=signature).status_code == 200


def test_rejects_a_delivery_with_only_a_v1a_signature():
    payload = body("company.created")
    msg_id, ts = "evt_v1a_only", now()
    signature = sign(payload, msg_id, ts).replace("v1,", "v1a,")
    assert send(payload, msg_id=msg_id, timestamp=ts, signature=signature).status_code == 400


def test_rejects_missing_headers():
    response = client.post("/webhooks/clemta", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send(body("company.created"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_a_different_secret():
    payload = body("company.created")
    msg_id, ts = "evt_other", now()
    signature = sign(payload, msg_id, ts, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id=msg_id, timestamp=ts, signature=signature).status_code == 400


def test_rejects_tampered_body():
    msg_id, ts = "evt_tamper", now()
    signature = sign(body("company.dissolved"), msg_id, ts)
    response = send(body("company.created"), msg_id=msg_id, timestamp=ts, signature=signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_timestamp_older_than_five_minutes():
    response = send(body("company.created"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("CLEMTA_WEBHOOK_SECRET", raising=False)
    assert send(body("company.created")).status_code == 500
