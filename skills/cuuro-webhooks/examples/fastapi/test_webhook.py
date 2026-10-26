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

# Cuuro bodies are {"data": {"id": ...}, "event": ...}; data.id is the company or analysis id
ID = "0191e29a-1644-7972-9466-18ada4a3636e"

EVENTS = ["startup.created", "analysis.created", "analysis.completed"]


def body(event: str, id: str = ID) -> str:
    return json.dumps({"data": {"id": id}, "event": event})


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
    return client.post("/webhooks/cuuro", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("CUURO_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type", EVENTS)
def test_handles_events(event_type):
    response = send(body(event_type))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_handles_unknown_event_types():
    response = send(body("analysis.something_new"))
    assert response.status_code == 200
    assert response.json()["type"] == "analysis.something_new"


def test_accepts_verified_delivery_without_event_field():
    response = send(json.dumps({"data": {"id": ID}}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None}


def test_rejects_verified_body_that_is_not_a_json_object():
    response = send("[1,2,3]")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_rejects_verified_body_that_is_not_json():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_verifies_regardless_of_content_type():
    assert send(body("analysis.created"), content_type="application/octet-stream").status_code == 200


def test_accepts_webhook_prefixed_headers():
    response = send(body("analysis.completed"), prefix="webhook")
    assert response.status_code == 200
    assert response.json()["type"] == "analysis.completed"


def test_accepts_any_matching_signature_among_several():
    payload = body("analysis.created")
    timestamp = now()
    signature = "v1,aW52YWxpZF9zaWduYXR1cmU= " + sign(payload, "msg_rotation", timestamp)
    assert send(payload, msg_id="msg_rotation", timestamp=timestamp, signature=signature).status_code == 200


def test_rejects_missing_headers():
    response = client.post("/webhooks/cuuro", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send(body("analysis.created"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    payload = body("analysis.created")
    timestamp = now()
    signature = sign(payload, "msg_other", timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id="msg_other", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_tampered_body():
    timestamp = now()
    signature = sign(body("analysis.created", "other-id"), "msg_tamper", timestamp)
    response = send(body("analysis.created"), msg_id="msg_tamper", timestamp=timestamp, signature=signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_ignores_signature_versions_other_than_v1():
    payload = body("analysis.created")
    timestamp = now()
    signature = sign(payload, "msg_v1a", timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id="msg_v1a", timestamp=timestamp, signature=signature).status_code == 400


def test_rejects_timestamp_older_than_five_minutes():
    response = send(body("analysis.created"), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_returns_500_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("CUURO_WEBHOOK_SECRET")
    assert send(body("analysis.created")).status_code == 500
