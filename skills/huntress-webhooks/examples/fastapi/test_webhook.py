import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Huntress uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json"):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/huntress",
        content=payload,
        headers={
            "content-type": content_type,
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("HUNTRESS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_body_without_type_is_accepted():
    response = send(json.dumps({"hello": "world"}))
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["type"] is None


def test_type_is_reported_when_present():
    response = send(json.dumps({"type": "example.event", "data": {}}))
    assert response.status_code == 200
    assert response.json()["type"] == "example.event"


def test_verifies_regardless_of_content_type():
    assert send(json.dumps({"a": 1}), content_type="text/plain").status_code == 200


def test_accepts_any_matching_signature_among_several():
    payload = json.dumps({"a": 1})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_rejects_missing_headers():
    response = client.post("/webhooks/huntress", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send('{"a":1}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    msg_id, timestamp = "msg_other", now()
    signature = sign('{"a":1}', msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send('{"a":1}', msg_id, timestamp, signature).status_code == 400


def test_rejects_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"a":1}', msg_id, timestamp)
    response = send('{"a":2}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_timestamp_older_than_five_minutes():
    response = send('{"a":1}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_rejects_signed_body_that_is_not_json():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("HUNTRESS_WEBHOOK_SECRET")
    assert send('{"a":1}').status_code == 500
