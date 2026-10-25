import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_agentline_secret"
os.environ["AGENTLINE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

EVENTS = [
    "call.received",
    "call.utterance",
    "call.completed",
    "call.owner_task",
    "call.failed",
    "call.busy",
    "call.no-answer",
    "call.canceled",
    "sms.received",
    "webhook.test",
]


def sign(body: bytes, secret: str = SECRET) -> str:
    # Bare hex HMAC-SHA256 of the raw body, keyed with the secret
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature: str | None = None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Webhook-Signature"] = signature
    return client.post("/webhooks/agentline", content=body, headers=headers)


@pytest.mark.parametrize("event_type", EVENTS)
def test_accepts_signed_event(event_type):
    body = json.dumps({"event_id": "evt_1", "agent_id": "ag_1", "event_type": event_type, "payload": {}}).encode()
    assert post(body, sign(body)).status_code == 200


def test_accepts_uppercase_hex():
    body = b'{"event_type": "webhook.test"}'
    assert post(body, sign(body).upper()).status_code == 200


def test_rejects_wrong_secret():
    body = b'{"event_type": "call.completed"}'
    assert post(body, sign(body, "other")).status_code == 401


def test_rejects_tampered_body():
    sig = sign(b'{"event_type": "call.completed"}')
    assert post(b'{"event_type": "call.failed"}', sig).status_code == 401


def test_rejects_malformed_signatures():
    body = b'{"event_type": "call.completed"}'
    for bad in ["zz" * 32, sign(body)[:62], "sha256=" + sign(body)]:
        assert post(body, bad).status_code == 401


def test_non_ascii_signature_is_401_not_500():
    body = b'{"event_type": "call.completed"}'
    response = client.post(
        "/webhooks/agentline",
        content=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": "é".encode("latin-1")},
    )
    assert response.status_code == 401


def test_missing_signature_is_400():
    assert post(b'{"event_type": "call.completed"}').status_code == 400


def test_signed_invalid_json_is_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
