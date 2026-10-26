import base64
import hashlib
import hmac
import json
import os
import time

# Glean signing secrets are 'whsec_' + base64(key).
# base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="
os.environ["GLEAN_SIGNING_SECRET"] = TEST_SECRET
os.environ.pop("GLEAN_DELIVERY_BEARER", None)

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

EVENT = {
    "version": "1",
    "trigger_id": "spec-7d2f1a8b3c9e0546",
    "datasource": "GOOGLECALENDAR",
    "doc_type": "event",
    "event_type": "CONTENT_SCHEDULE",
    "title": "Platform weekly",
    "view_url": "https://www.google.com/calendar/event?eid=abc",
    "event_time": "2026-08-25T18:30:00Z",
    "time_offset_seconds": 1800,
}


def sign(body: bytes, timestamp: str, msg_id: str) -> str:
    # base64(HMAC_SHA256(base64Decode(secret after whsec_), "{id}.{timestamp}.{body}"))
    key = base64.b64decode(TEST_SECRET[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def send(body=None, ts=None, msg_id="msg_test", signature=None, headers=None, content_type="text/plain"):
    body = body if body is not None else json.dumps(EVENT).encode()
    ts = ts or str(int(time.time()))
    h = {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(body, ts, msg_id),
    }
    h.update(headers or {})
    return client.post("/webhooks/glean", content=body, headers=h)


def test_valid_content_schedule_any_content_type():
    r = send()
    assert r.status_code == 200
    assert r.json() == {"success": True, "event_type": "CONTENT_SCHEDULE"}


def test_multiple_signatures():
    body = json.dumps(EVENT).encode()
    ts = str(int(time.time()))
    r = send(body=body, ts=ts, signature=f"v1,aW52YWxpZA== {sign(body, ts, 'msg_test')}")
    assert r.status_code == 200


def test_unknown_event_type():
    r = send(body=json.dumps({**EVENT, "event_type": "OTHER"}).encode())
    assert r.status_code == 200
    assert r.json()["event_type"] == "OTHER"


def test_invalid_signature():
    assert send(signature="v1,aW52YWxpZF9zaWduYXR1cmU=").status_code == 400


def test_tampered_body():
    ts = str(int(time.time()))
    sig = sign(json.dumps(EVENT).encode(), ts, "msg_test")
    r = send(body=json.dumps({**EVENT, "title": "x"}).encode(), ts=ts, signature=sig)
    assert r.status_code == 400


def test_old_timestamp_rejected_by_library_window():
    r = send(ts=str(int(time.time()) - 600))
    assert r.status_code == 400
    assert r.json()["detail"] == "Timestamp too old"


def test_missing_headers():
    r = client.post("/webhooks/glean", content=b"{}")
    assert r.status_code == 400


def test_bearer_credential_when_configured(monkeypatch):
    monkeypatch.setenv("GLEAN_DELIVERY_BEARER", "delivery-secret")
    assert send(headers={"authorization": "Bearer nope"}).status_code == 401
    assert send(headers={"authorization": "Bearer delivery-secret"}).status_code == 200
