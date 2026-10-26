import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# SafeBase (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm SafeBase uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/safebase",
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
    monkeypatch.setenv("SAFEBASE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "event_type",
    [
        "accessRequest.requested",
        "accessRequest.blocked",
        "accessRequest.autoApprove.requireManual",
        "accounts.created",
        "accounts.nda.completed",
        "portal.viewed",
        "portal.file.downloaded",
        "questionnaire.completed",
        "knowledgebase.entry.created",
    ],
)
def test_events(event_type):
    response = send(json.dumps({"eventType": event_type, "data": {"id": "1"}}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_body_without_event_name():
    """SafeBase's test event has no event name."""
    response = send(json.dumps({"message": "test"}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None}


@pytest.mark.parametrize("key", ["event_type", "type", "event"])
def test_event_name_fallback_keys(key):
    response = send(json.dumps({key: "portal.viewed"}))
    assert response.json()["type"] == "portal.viewed"


def test_unknown_event_type():
    response = send(json.dumps({"eventType": "something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "something.new"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"eventType": "portal.viewed"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_webhook_prefixed_headers():
    """The same values sent as webhook-* instead of svix-* are accepted."""
    payload = json.dumps({"eventType": "portal.viewed"})
    msg_id, timestamp = "msg_webhook_prefix", now()
    response = client.post(
        "/webhooks/safebase",
        content=payload,
        headers={
            "content-type": "application/json",
            "webhook-id": msg_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": sign(payload, msg_id, timestamp),
        },
    )
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "portal.viewed"}


def test_missing_headers():
    response = client.post("/webhooks/safebase", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"eventType":"portal.viewed"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = '{"eventType":"portal.viewed"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"eventType":"portal.viewed"}', msg_id, timestamp)
    response = send('{"eventType":"portal.file.downloaded"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"eventType":"portal.viewed"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SAFEBASE_WEBHOOK_SECRET")
    assert send('{"eventType":"portal.viewed"}').status_code == 500
