import base64
import hashlib
import hmac
import json
import os
import time

# Svix-style secret: 'whsec_' + base64 of the key bytes (here "test_secret_key_12345")
SECRET = "whsec_" + base64.b64encode(b"test_secret_key_12345").decode()
os.environ["STYTCH_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, stytch_event_type  # noqa: E402

client = TestClient(app)


def sign(body: str, msg_id="msg_test123", timestamp=None, secret=SECRET):
    timestamp = int(time.time()) if timestamp is None else timestamp
    key = base64.b64decode(secret.split("_", 1)[1])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return {
        "svix-id": msg_id,
        "svix-timestamp": str(timestamp),
        "svix-signature": "v1," + base64.b64encode(digest).decode(),
        "content-type": "application/json",
    }


def post(body: str, headers):
    return client.post("/webhooks/stytch", content=body, headers=headers)


MEMBER_UPDATE = json.dumps({
    "project_id": "project-test-123",
    "event_id": "event-test-456",
    "action": "UPDATE",
    "object_type": "member",
    "source": "DIRECT",
    "id": "member-test-123",
    "timestamp": "2024-03-07T18:49:32.760777783Z",
    "member": {"member_id": "member-test-123"},
})


def test_valid_signature_derives_event_type():
    res = post(MEMBER_UPDATE, sign(MEMBER_UPDATE))
    assert res.status_code == 200
    assert res.json() == {"success": True, "type": "direct.member.update"}


def test_valid_signature_among_several():
    headers = sign(MEMBER_UPDATE)
    headers["svix-signature"] = f"v1,AAAA {headers['svix-signature']} v2,BBBB"
    assert post(MEMBER_UPDATE, headers).status_code == 200


def test_delete_event_without_entity():
    body = json.dumps({"action": "DELETE", "object_type": "saml_connection",
                       "source": "DIRECT", "id": "saml-connection-test-1"})
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["type"] == "direct.saml_connection.delete"


def test_wrong_secret_rejected():
    other = "whsec_" + base64.b64encode(b"another_secret").decode()
    res = post(MEMBER_UPDATE, sign(MEMBER_UPDATE, secret=other))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_tampered_body_rejected():
    res = post(MEMBER_UPDATE.replace("UPDATE", "DELETE"), sign(MEMBER_UPDATE))
    assert res.status_code == 400


def test_accepts_old_timestamp_by_default(monkeypatch):
    # Retries and replays keep the original timestamp, so the window is off by default
    monkeypatch.delenv("STYTCH_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
    old = int(time.time()) - 3600
    res = post(MEMBER_UPDATE, sign(MEMBER_UPDATE, timestamp=old))
    assert res.status_code == 200


def test_rejects_old_timestamp_when_window_set(monkeypatch):
    monkeypatch.setenv("STYTCH_TIMESTAMP_TOLERANCE_SECONDS", "300")
    old = int(time.time()) - 3600
    res = post(MEMBER_UPDATE, sign(MEMBER_UPDATE, timestamp=old))
    assert res.status_code == 400
    assert res.json()["detail"] == "Timestamp too old"


def test_non_numeric_window_treated_as_zero(monkeypatch):
    monkeypatch.setenv("STYTCH_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
    old = int(time.time()) - 3600
    res = post(MEMBER_UPDATE, sign(MEMBER_UPDATE, timestamp=old))
    assert res.status_code == 200


def test_missing_headers_rejected():
    res = client.post("/webhooks/stytch", content=MEMBER_UPDATE)
    assert res.status_code == 400


def test_invalid_json_rejected():
    res = post("not json", sign("not json"))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


def test_event_type_helper():
    assert stytch_event_type({"source": "SCIM", "object_type": "member", "action": "UPDATE"}) == "scim.member.update"
    assert stytch_event_type({"id": "x"}) is None
