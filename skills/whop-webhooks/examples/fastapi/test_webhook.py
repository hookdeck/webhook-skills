import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Whop secrets are "ws_" + 64 hex chars and are used as the literal UTF-8 HMAC key.
TEST_SECRET = "ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
os.environ["WHOP_WEBHOOK_SECRET"] = TEST_SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, msg_id="msg_test123", timestamp=None, secret=TEST_SECRET):
    """Standard Webhooks signature as Whop produces it: HMAC-SHA256 over
    "{id}.{timestamp}.{body}" keyed with the literal secret, base64, prefixed "v1,"."""
    timestamp = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": str(timestamp),
        "webhook-signature": "v1," + base64.b64encode(digest).decode(),
    }


def event(event_type: str) -> str:
    return json.dumps(
        {
            "id": "msg_test123",
            "type": event_type,
            "api_version": "v1",
            "timestamp": "2026-08-10T17:03:24.291Z",
            "account_id": "biz_XXXXXXXX",
            "data": {"id": "pay_XXXXXXXX"},
        }
    )


@pytest.mark.parametrize(
    "event_type",
    ["payment.succeeded", "payment.failed", "membership.activated", "membership.deactivated", "refund.created"],
)
def test_accepts_valid_events(event_type):
    body = event(event_type)
    res = client.post("/webhooks/whop", content=body, headers=sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_unhandled_event_type():
    body = event("product.updated")
    res = client.post("/webhooks/whop", content=body, headers=sign(body))
    assert res.status_code == 200


def test_rejects_wrong_secret():
    body = event("payment.succeeded")
    res = client.post("/webhooks/whop", content=body, headers=sign(body, secret="ws_wrong"))
    assert res.status_code == 400


def test_rejects_tampered_body():
    headers = sign(event("payment.succeeded"))
    res = client.post("/webhooks/whop", content=event("refund.created"), headers=headers)
    assert res.status_code == 400


def test_rejects_prefix_stripped_secret():
    body = event("payment.succeeded")
    res = client.post("/webhooks/whop", content=body, headers=sign(body, secret=TEST_SECRET[3:]))
    assert res.status_code == 400


def test_rejects_missing_headers():
    res = client.post("/webhooks/whop", content=event("payment.succeeded"), headers={"content-type": "application/json"})
    assert res.status_code == 400


def test_accepts_old_timestamp_by_default(monkeypatch):
    # Retries and replays keep the original timestamp, so the window is off by default
    monkeypatch.delenv("WHOP_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
    old = int(time.time()) - 3600
    body = event("payment.succeeded")
    res = client.post("/webhooks/whop", content=body, headers=sign(body, timestamp=old))
    assert res.status_code == 200


def test_rejects_old_timestamp_when_window_set(monkeypatch):
    monkeypatch.setenv("WHOP_TIMESTAMP_TOLERANCE_SECONDS", "300")
    old = int(time.time()) - 3600
    body = event("payment.succeeded")
    res = client.post("/webhooks/whop", content=body, headers=sign(body, timestamp=old))
    assert res.status_code == 400


def test_non_numeric_window_treated_as_zero(monkeypatch):
    monkeypatch.setenv("WHOP_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
    old = int(time.time()) - 3600
    body = event("payment.succeeded")
    res = client.post("/webhooks/whop", content=body, headers=sign(body, timestamp=old))
    assert res.status_code == 200
