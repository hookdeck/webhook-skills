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
    "tensorlake.sandbox.created": {'previous_status': None, 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'pending', 'outcome': None, 'outcome_reason': None, 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.sandbox.running": {'previous_status': 'pending', 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'running', 'outcome': None, 'outcome_reason': None, 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.sandbox.suspended": {'previous_status': 'running', 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'suspended', 'outcome': None, 'outcome_reason': None, 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.sandbox.resumed": {'previous_status': 'suspended', 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'pending', 'outcome': None, 'outcome_reason': None, 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.sandbox.terminated": {'previous_status': 'running', 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'terminated', 'outcome': 'success', 'outcome_reason': 'user_terminated', 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.sandbox.failed": {'previous_status': 'running', 'sandbox': {'id': '9q2j1f4n6y8x0r3k5m7pa', 'name': 'build-runner', 'type': 'named', 'image': 'tensorlake/ubuntu-minimal', 'generation_id': 1, 'status': 'terminated', 'outcome': 'failure', 'outcome_reason': 'out_of_memory', 'snapshot_id': None, 'created_at': '2026-07-24T20:10:00Z', 'resources': {'cpus': 2, 'memory_mb': 4096, 'disk_mb': 20480, 'gpu_count': 0, 'gpu_model': None}}},
    "tensorlake.application.created": {'previous_version': None, 'previous_state': None, 'application': {'name': 'invoice-parser', 'version': '2026-07-24'}},
    "tensorlake.application.updated": {'previous_version': '2026-07-23', 'previous_state': 'ready', 'application': {'name': 'invoice-parser', 'version': '2026-07-24'}},
    "tensorlake.application.deleted": {'previous_version': '2026-07-24', 'previous_state': 'ready', 'application': {'name': 'invoice-parser', 'version': '2026-07-24'}},
    "tensorlake.application.request.created": {'application': {'name': 'invoice-parser', 'version': '2026-07-24'}, 'request': {'id': 'req_01k0example', 'status': 'pending', 'failure_reason': None, 'created_at': '2026-07-24T21:24:35.101Z', 'finished_at': None}},
    "tensorlake.application.request.completed": {'application': {'name': 'invoice-parser', 'version': '2026-07-24'}, 'request': {'id': 'req_01k0example', 'status': 'completed', 'failure_reason': None, 'created_at': '2026-07-24T21:24:35.101Z', 'finished_at': '2026-07-24T21:24:37.456Z'}},
    "tensorlake.application.request.failed": {'application': {'name': 'invoice-parser', 'version': '2026-07-24'}, 'request': {'id': 'req_01k0example', 'status': 'failed', 'failure_reason': 'function_error', 'created_at': '2026-07-24T21:24:35.101Z', 'finished_at': '2026-07-24T21:24:37.456Z'}},
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
    """prefix is 'svix' (Tensorlake) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/tensorlake",
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
    monkeypatch.setenv("TENSORLAKE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, "event_id": "evt_019f95fb-7f33-7000-8000-000000000006", "event_version": 1, "occurred_at": "2026-07-24T21:15:15.123Z", "project_id": "project_123", "source_id": "src_01k0example", "source_revision": "81247", "source_ordinal": 0, "data": data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "tensorlake.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "tensorlake.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "tensorlake.application.request.completed", "data": {"request": {"id": "req_01k0example"}}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event_type": "tensorlake.application.request.completed", "data": {"request": {"id": "req_01k0example"}}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "tensorlake.application.request.completed"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"tensorlake.application.request.completed"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "tensorlake.application.request.completed"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/tensorlake", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"tensorlake.application.request.completed"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"tensorlake.application.request.completed"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"tensorlake.application.request.completed"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"tensorlake.application.request.failed"}', msg_id, timestamp)
    response = send('{"event_type":"tensorlake.application.request.completed"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"tensorlake.application.request.completed"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TENSORLAKE_WEBHOOK_SECRET")
    assert send('{"event_type":"tensorlake.application.request.completed"}').status_code == 500
