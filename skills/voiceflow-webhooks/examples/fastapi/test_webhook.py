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

EVENTS = {
    "organization.project.created": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "6a16f4549e4196323d8a49b9", "projectMetadata": { "name": "My new project" }, "workspaceID": "95kwAZ63nO", "createdBy": { "type": "user", "userEmail": "user@voiceflow.com" } } },
    "organization.project.deleted": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "6a16f4789e4196323d8a49c3", "projectMetadata": { "name": "Legacy support agent" }, "deletedBy": { "type": "user", "userEmail": "user@voiceflow.com" } } },
    "organization.project.environment.created": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "69e8b60a99c9a35e1a5e8872", "createdProjectEnvironmentID": "6a16f4dc9e4196323d8a49e5", "createdProjectEnvironmentMetadata": { "alias": "optimizeglobalprompt", "isLive": False, "name": "Optimize global prompt", "trafficPercentage": 0 }, "source": { "environmentID": "69e8b60a99c9a35e1a5e8875", "type": "environment" } } },
    "organization.project.environment.published": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "69e8b60a99c9a35e1a5e8872", "publishedProjectEnvironmentID": "69e8b60a99c9a35e1a5e8875", "publishedVersionIDBefore": "69e8e543ce546b913fc2c965", "publishedVersionIDAfter": "6a16f4b29e4196323d8a49db" } },
    "organization.project.environment.merged": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "69e8b60a99c9a35e1a5e8872", "sourceProjectEnvironmentID": "6a16f4dc9e4196323d8a49e5", "sourceProjectEnvironmentRemoved": True, "targetProjectEnvironmentID": "69e8b60a99c9a35e1a5e8875" } },
    "organization.project.environment.deleted": { "data": { "organizationID": "LVkmPy8AE2", "projectID": "69e8b60a99c9a35e1a5e8872", "deletedProjectEnvironmentID": "69e8b64d99c9a35e1a5e888b" } },
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Voiceflow) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/voiceflow",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("VOICEFLOW_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"type": event_type, "resource": "organization-LVkmPy8AE2", "time": 1779889237608, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"type": "organization.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "organization.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "organization.project.created", "data": {"projectID": "p1"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "organization.project.created", "data": {"projectID": "p1"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "organization.project.created"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"organization.project.created"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "organization.project.environment.published"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/voiceflow", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"organization.project.environment.published"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"organization.project.environment.published"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"organization.project.environment.published"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"organization.project.deleted"}', msg_id, timestamp)
    response = send('{"type":"organization.project.created"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"organization.project.environment.published"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("VOICEFLOW_WEBHOOK_SECRET")
    assert send('{"type":"organization.project.environment.published"}').status_code == 500
