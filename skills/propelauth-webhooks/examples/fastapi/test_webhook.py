import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# PropelAuth (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
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
        "/webhooks/propelauth",
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
    monkeypatch.setenv("PROPELAUTH_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "event_type,data",
    [
        ("user.created", {"user_id": "u_1", "email": "a@example.com"}),
        ("user.updated", {"user_id": "u_1"}),
        ("user.deleted", {"user_id": "u_1"}),
        ("org.created", {"org_id": "o_1", "name": "Acme"}),
        ("user.added_to_org", {"user_id": "u_1", "org_id": "o_1"}),
    ],
)
def test_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_type_field_fallback():
    response = send(json.dumps({"type": "user.created", "user_id": "u_1"}))
    assert response.status_code == 200
    assert response.json()["type"] == "user.created"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "user.created", "user_id": "u_1"}), content_type="text/plain")
    assert response.status_code == 200


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "user.login", "user_id": "u_1"}))
    assert response.status_code == 200
    assert response.json()["type"] == "user.login"


def test_multiple_signatures():
    """Any matching v1, entry passes."""
    payload = json.dumps({"event_type": "user.created", "user_id": "u_1"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/propelauth", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"user.created"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = '{"event_type":"user.created"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"user.created","user_id":"u_1"}', msg_id, timestamp)
    response = send('{"event_type":"user.created","user_id":"u_2"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"user.created"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_signed_non_json_body():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("PROPELAUTH_WEBHOOK_SECRET")
    assert send('{"event_type":"user.created"}').status_code == 500
