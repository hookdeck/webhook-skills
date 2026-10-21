import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix signing secrets are 'whsec_' + base64(key).
# base64 of "test_secret_key_for_nash_webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl9uYXNoX3dlYmhvb2tz"

client = TestClient(app)

TASK_CREATED = json.dumps(
    {
        "type": "task",
        "event": "created",
        "data": {"id": "job_R7FXJrfB99bpvpzf6CriJC", "isBatch": False, "jobConfigurations": []},
    }
)


def sign(body: str, secret: str, msg_id: str, timestamp: str) -> str:
    """Sign exactly as Svix does for Nash:
    base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))"""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def signed_headers(body: str, secret: str = TEST_SECRET, timestamp: str | None = None,
                   signature: str | None = None) -> dict:
    msg_id = "msg_" + secrets.token_hex(12)
    timestamp = timestamp or str(int(time.time()))
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": signature or sign(body, secret, msg_id, timestamp),
    }


@pytest.fixture(autouse=True)
def nash_secret(monkeypatch):
    monkeypatch.setenv("NASH_WEBHOOK_SECRET", TEST_SECRET)


def post(body: str, headers: dict):
    return client.post("/webhooks/nash", content=body, headers=headers)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_valid_signature():
    response = post(TASK_CREATED, signed_headers(TASK_CREATED))
    assert response.status_code == 200
    assert response.json() == {"received": True, "type": "task.created"}


def test_multiple_signatures_one_valid():
    headers = signed_headers(TASK_CREATED)
    headers["svix-signature"] = "v1,bm9wZQ== " + headers["svix-signature"]
    assert post(TASK_CREATED, headers).status_code == 200


def test_missing_headers():
    response = post(TASK_CREATED, {"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing Svix signature headers"


def test_invalid_signature():
    response = post(TASK_CREATED, signed_headers(TASK_CREATED, signature="v1,aW52YWxpZA=="))
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    headers = signed_headers(TASK_CREATED, secret="whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert post(TASK_CREATED, headers).status_code == 400


def test_tampered_body():
    headers = signed_headers(TASK_CREATED)
    assert post(TASK_CREATED.replace("created", "failed"), headers).status_code == 400


def test_stale_timestamp():
    old = str(int(time.time()) - 600)
    assert post(TASK_CREATED, signed_headers(TASK_CREATED, timestamp=old)).status_code == 400


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("NASH_WEBHOOK_SECRET")
    assert post(TASK_CREATED, signed_headers(TASK_CREATED)).status_code == 500


@pytest.mark.parametrize(
    "entity,event",
    [
        ("delivery", "created"),
        ("delivery", "assigned_driver"),
        ("delivery", "dropoff_complete"),
        ("delivery", "canceled_by_provider"),
        ("delivery", "failed"),
        ("task", "created"),
        ("task", "canceled_by_provider"),
        ("task", "failed"),
        ("courier_location", "updated"),
        ("courier_name", "updated"),
        ("shift", "dispatched"),
        ("task", "refund_created"),
    ],
)
def test_event_types(entity, event):
    body = json.dumps({"type": entity, "event": event, "data": {"id": "job_123"}})
    response = post(body, signed_headers(body))
    assert response.status_code == 200
    assert response.json()["type"] == f"{entity}.{event}"
