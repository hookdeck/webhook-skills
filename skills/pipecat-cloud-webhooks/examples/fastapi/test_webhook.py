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
    "build.started": {"build_id": "9f1c3a52", "region": "us-west-2", "status": "building", "triggered_by": "github", "commit_sha": None, "ref": None, "repo_full_name": None},
    "build.succeeded": {"build_id": "9f1c3a52", "region": "us-west-2", "status": "success", "triggered_by": "github", "image_uri": "123456789012.dkr.ecr.us-west-2.amazonaws.com/acme-co/voice-agent:e3b0c44", "build_duration_seconds": 94},
    "build.failed": {"build_id": "9f1c3a52", "status": "failed", "error_message": "Dockerfile not found", "build_duration_seconds": 12},
    "build.timeout": {"build_id": "9f1c3a52", "status": "timeout", "error_message": "Build timed out", "build_duration_seconds": 3600},
    "deployment.created": {"deployment_id": "d1f7b2c8", "service_id": "2a8e5c17", "service_name": "voice-agent", "region": "us-west-2", "build_id": None},
    "deployment.updated": {"deployment_id": "d1f7b2c8", "service_id": "2a8e5c17", "service_name": "voice-agent", "region": "us-west-2", "build_id": "9f1c3a52"},
    "service.suspended": {"service_id": "2a8e5c17", "service_name": "voice-agent", "region": "us-west-2", "reason": "trial_exhausted"},
    "service.resumed": {"service_id": "2a8e5c17", "service_name": "voice-agent", "region": "us-west-2"},
    "spend.threshold_reached": {"percent": 80, "current_spend_cents": 8000, "limit_cents": 10000},
    "spend.limit_reached": {"current_spend_cents": 10000, "limit_cents": 10000},
    "spend.limit_cleared": {"previous_limit_cents": 10000},
    "session.started": {"session_id": "b4d9e017", "service": "voice-agent", "transport": "daily", "region": "us-west-2"},
    "org.trial_started": {"org_name": "acme-co", "trial_credits_cents": 5000},
    "org.trial_ended": {"org_name": "acme-co", "amount_due_cents": 1200},
    "api_key.created": {"key_id": "key_01", "name": "ci", "type": "private", "actor_user_id": None},
    "api_key.rotated": {"key_id": "key_01", "name": "ci", "type": "private", "actor_user_id": "user_2mK9"},
    "api_key.deleted": {"key_id": "key_01", "name": None, "type": "public", "actor_user_id": "user_2mK9"},
    "secret.created": {"set_name": "voice-agent-secrets", "region": "us-west-2", "type": "secret", "scope": "set", "actor_user_id": "user_2mK9"},
    "secret.updated": {"set_name": "voice-agent-secrets", "region": "us-west-2", "type": "secret", "scope": "field", "actor_user_id": "user_2mK9", "field_names": ["OPENAI_API_KEY"]},
    "secret.deleted": {"set_name": "voice-agent-secrets", "region": "us-west-2", "type": "imagePullSecret", "scope": "set", "actor_user_id": None},
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
    """prefix is 'svix' (Pipecat Cloud) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/pipecat-cloud",
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
    monkeypatch.setenv("PIPECAT_CLOUD_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, "org": "acme-co", "created_at": "2026-08-25T11:40:32.000Z", "data": data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "pipecat_cloud.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "pipecat_cloud.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "build.succeeded", "data": {"build_id": "9f1c3a52"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event_type": "build.succeeded", "data": {"build_id": "9f1c3a52"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "build.succeeded"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"build.succeeded"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "build.succeeded"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/pipecat-cloud", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"build.succeeded"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"build.succeeded"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"build.succeeded"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"build.failed"}', msg_id, timestamp)
    response = send('{"event_type":"build.succeeded"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"build.succeeded"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("PIPECAT_CLOUD_WEBHOOK_SECRET")
    assert send('{"event_type":"build.succeeded"}').status_code == 500
