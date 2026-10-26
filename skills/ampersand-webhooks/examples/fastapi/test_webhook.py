import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

NOTIFICATION_TYPES = [
    "installation.created", "installation.updated", "installation.deleted",
    "connection.created", "connection.refreshed", "connection.updated", "connection.deleted", "connection.error",
    "read.backfill.done", "read.backfill.error", "read.schedule.paused", "read.triggered.done", "read.triggered.error",
    "write.async.done",
    "subscribe.create.success", "subscribe.update.success", "subscribe.delete.success",
    "subscribe.create.error", "subscribe.update.error", "subscribe.delete.error",
    "destination.webhook.disabled", "destination.delivery.error",
]


def sign(payload: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """base64(HMAC_SHA256(base64Decode(secret after whsec_), '{id}.{timestamp}.{body}'))"""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def signed_headers(payload: str, timestamp: Optional[str] = None, signature: Optional[str] = None,
                   content_type: str = "application/json") -> dict:
    ts = timestamp or str(int(time.time()))
    msg_id = "msg_" + secrets.token_hex(12)
    return {
        "content-type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(payload, ts, msg_id),
    }


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("AMPERSAND_WEBHOOK_SECRET", TEST_SECRET)


def post(payload: str, headers: dict):
    return client.post("/webhooks/ampersand", content=payload, headers=headers)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_notification():
    payload = json.dumps({"notificationType": "installation.created", "data": {"installationId": "inst_1"}})
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "installation.created"}


@pytest.mark.parametrize("notification_type", NOTIFICATION_TYPES)
def test_notification_types(notification_type):
    payload = json.dumps({"notificationType": notification_type, "data": {"installationId": "inst_1"}})
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json()["type"] == notification_type


def test_unknown_notification_type():
    payload = json.dumps({"notificationType": "something.new", "data": {}})
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json()["type"] == "something.new"


def test_read_result_inline():
    payload = json.dumps({
        "action": "read", "groupRef": "acme", "objectName": "Contact",
        "resultInfo": {"type": "inline", "numRecords": 1},
        "result": [{"fields": {"id": "001"}, "mappedFields": {}, "raw": {"id": "001"}}],
    })
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "read"}


def test_read_result_url():
    payload = json.dumps({
        "action": "read", "groupRef": "acme", "objectName": "Contact",
        "resultInfo": {"type": "url", "downloadUrl": "https://example.com/r.json", "numRecords": 1},
    })
    assert post(payload, signed_headers(payload)).status_code == 200


def test_subscribe_result():
    payload = json.dumps({
        "action": "subscribe", "groupRef": "acme", "objectName": "company",
        "resultInfo": {"type": "inline", "numRecords": 1},
        "result": [{"fields": {"id": "001"}, "subscribeEventType": "update", "providerEventType": "UPDATE", "raw": {}}],
    })
    response = post(payload, signed_headers(payload))
    assert response.json()["type"] == "subscribe"


def test_any_content_type_is_verified():
    payload = json.dumps({"notificationType": "connection.created", "data": {}})
    response = post(payload, signed_headers(payload, content_type="text/plain"))
    assert response.status_code == 200


def test_multiple_signatures_rotation():
    payload = json.dumps({"notificationType": "connection.error", "data": {}})
    headers = signed_headers(payload)
    headers["svix-signature"] = "v1,aW52YWxpZF9zaWduYXR1cmU= " + headers["svix-signature"]
    assert post(payload, headers).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/ampersand", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert "Missing required" in response.json()["detail"]


def test_invalid_signature():
    payload = json.dumps({"notificationType": "installation.created", "data": {}})
    response = post(payload, signed_headers(payload, signature="v1,aW52YWxpZF9zaWduYXR1cmU="))
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    payload = json.dumps({"notificationType": "installation.created", "data": {}})
    headers = signed_headers(payload)
    assert post(payload.replace("created", "deleted"), headers).status_code == 400


def test_old_timestamp():
    payload = json.dumps({"notificationType": "installation.created", "data": {}})
    old = str(int(time.time()) - 600)
    response = post(payload, signed_headers(payload, timestamp=old))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_signed_non_json_body():
    payload = "not json"
    response = post(payload, signed_headers(payload, content_type="text/plain"))
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("AMPERSAND_WEBHOOK_SECRET")
    payload = "{}"
    assert post(payload, signed_headers(payload)).status_code == 500
