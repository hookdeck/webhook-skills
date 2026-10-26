import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """base64(HMAC_SHA256(base64Decode(secret_after_whsec_), "{id}.{timestamp}.{payload}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("FIBER_AI_WEBHOOK_SECRET", TEST_SECRET)


def post(payload: str, msg_id=None, ts=None, sig=None, content_type="application/json"):
    msg_id = msg_id or "msg_" + secrets.token_hex(16)
    ts = ts or str(int(time.time()))
    return client.post(
        "/webhooks/fiber-ai",
        content=payload,
        headers={
            "content-type": content_type,
            "svix-id": msg_id,
            "svix-timestamp": ts,
            "svix-signature": sig or sign(payload, TEST_SECRET, ts, msg_id),
        },
    )


@pytest.mark.parametrize(
    "event_type,body",
    [
        ("reveal.completed", {"type": "reveal.completed", "task_id": "abc123", "success": True}),
        ("batch_live_enrich.completed", {"type": "batch_live_enrich.completed", "task_id": "t1", "completed": 3, "failed": 0, "not_found": 1, "malformed": 0}),
        ("batch_contact_enrich.completed", {"type": "batch_contact_enrich.completed", "task_id": "t2", "success": True}),
        ("mosaic.completed", {"type": "mosaic.completed", "task_id": "t3", "success": True}),
        ("audience.enrichment_completed", {"type": "audience.enrichment_completed", "audience_id": "a1", "success": True}),
        ("tracker.signal_detected", {"type": "tracker.signal_detected", "eventId": "e1", "occurredAt": "2026-01-01T00:00:00Z"}),
        ("job.changed", {"type": "job.changed", "profiles": [{"listId": "l1"}]}),
    ],
)
def test_processes_valid_events(event_type, body):
    res = post(json.dumps(body))
    assert res.status_code == 200
    assert res.json() == {"success": True, "type": event_type}


def test_recognises_job_changed_by_profiles_without_type():
    res = post(json.dumps({"profiles": [{"listId": "l1"}]}))
    assert res.status_code == 200
    assert res.json()["type"] == "job.changed"


def test_verifies_any_content_type():
    res = post(json.dumps({"type": "reveal.completed"}), content_type="text/plain")
    assert res.status_code == 200


def test_accepts_any_matching_entry_in_multi_signature_header():
    payload = json.dumps({"type": "reveal.completed"})
    msg_id, ts = "msg_rot", str(int(time.time()))
    good = sign(payload, TEST_SECRET, ts, msg_id)
    res = post(payload, msg_id, ts, sig="v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= " + good)
    assert res.status_code == 200


def test_unknown_event_type_returns_200():
    res = post(json.dumps({"type": "something.new"}))
    assert res.status_code == 200
    assert res.json()["type"] == "something.new"


def test_rejects_invalid_signature():
    res = post(json.dumps({"type": "reveal.completed"}), sig="v1,invalidsignature")
    assert res.status_code == 400


def test_rejects_tampered_body():
    msg_id, ts = "msg_t", str(int(time.time()))
    sig = sign(json.dumps({"type": "reveal.completed", "task_id": "a"}), TEST_SECRET, ts, msg_id)
    res = post(json.dumps({"type": "reveal.completed", "task_id": "b"}), msg_id, ts, sig)
    assert res.status_code == 400


def test_rejects_timestamp_older_than_five_minutes():
    ts = str(int(time.time()) - 600)
    res = post(json.dumps({"type": "reveal.completed"}), ts=ts)
    assert res.status_code == 400


def test_rejects_missing_headers():
    res = client.post("/webhooks/fiber-ai", content="{}", headers={"content-type": "application/json"})
    assert res.status_code == 400


def test_rejects_invalid_json_that_is_correctly_signed():
    res = post("not json")
    assert res.status_code == 400
