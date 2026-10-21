import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Vanta (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Vanta uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/vanta",
        content=payload,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("VANTA_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_payload_only_body_routes_on_domain():
    response = send(json.dumps({"questionnaire": {"id": "123", "status": "COMPLETE"}}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None, "domain": "questionnaire"}


@pytest.mark.parametrize(
    "event_type,data,domain",
    [
        ("v1.questionnaire.status-changed", {"questionnaire": {"id": "123", "status": "COMPLETE"}}, "questionnaire"),
        ("v1.questionnaire.export-completed", {"questionnaire": {"id": "507f"}, "export": {"id": "6a7b", "format": "original"}}, "questionnaire"),
        ("v1.vendor.decision.created", {"vendor": {"id": "123", "decision": {"status": "APPROVED"}}}, "vendor"),
        ("v1.trust-center.access-request.received", {"trustCenter": {"slugId": "123"}, "accessRequest": {"id": "123"}}, "trustCenter"),
        ("v1.trust-center.access-request.approved", {"trustCenter": {"slugId": "123"}, "accessRequest": {"id": "123"}, "viewer": {"id": "123"}}, "trustCenter"),
        ("v1.evidence.status-changed", {"evidence": {"id": "8f9e", "auditId": "5f8d", "oldStatus": "NOT_READY_FOR_AUDIT", "newStatus": "READY_FOR_AUDIT"}}, "evidence"),
    ],
)
def test_enveloped_events(event_type, data, domain):
    response = send(json.dumps({"type": event_type, "payload": data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type, "domain": domain}


def test_unknown_event_type():
    response = send(json.dumps({"type": "v1.something.new", "payload": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "v1.something.new"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"vendor": {"id": "123"}})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/vanta", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"vendor":{"id":"123"}}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = '{"vendor":{"id":"123"}}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"vendor":{"id":"123"}}', msg_id, timestamp)
    response = send('{"vendor":{"id":"456"}}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"vendor":{"id":"123"}}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("VANTA_WEBHOOK_SECRET")
    assert send('{"vendor":{"id":"123"}}').status_code == 500
