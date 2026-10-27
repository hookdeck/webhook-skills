import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest
from fastapi.testclient import TestClient

# Featurebase secrets look like "whsec_..." and are used WHOLE as a plain UTF-8 HMAC key.
SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5"
os.environ["FEATUREBASE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(body: bytes, timestamp, secret: str = SECRET) -> str:
    return hmac.new(
        secret.encode("utf-8"), str(timestamp).encode("latin-1") + b"." + body, hashlib.sha256
    ).hexdigest()


def make_event(topic="post.created", item=None) -> bytes:
    item = item or {"object": "post", "id": "p1", "title": "Dark mode"}
    return json.dumps(
        {
            "object": "notification_event",
            "id": f"notif_test_{next(_counter)}_{time.time_ns()}",
            "topic": topic,
            "organizationId": "org1",
            "webhookId": "wh1",
            "createdAt": "2026-10-09T12:00:00.000Z",
            "data": {"object": "notification_event_data", "item": item},
        }
    ).encode()


_UNSET = object()


def send(body: bytes, signature=_UNSET, timestamp=_UNSET, content_type="application/json"):
    ts = int(time.time()) if timestamp is _UNSET else timestamp
    sig = sign(body, ts) if signature is _UNSET else signature
    headers = {"Content-Type": content_type}
    if sig is not None:
        headers["X-Webhook-Signature"] = sig
    if ts is not None:
        headers["X-Webhook-Timestamp"] = str(ts)
    return client.post("/webhooks/featurebase", content=body, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("FEATUREBASE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_accepts_valid_signature():
    res = send(make_event())
    assert res.status_code == 200
    assert res.json()["received"] is True


@pytest.mark.parametrize(
    "topic",
    [
        "post.created",
        "post.updated",
        "post.voted",
        "ticket.created",
        "comment.created",
        "changelog.published",
        "conversation.user.created",
        "conversation.admin.assigned",
        "conversation.admin.closed",
        "post.deleted",
    ],
)
def test_handles_topics(topic):
    assert send(make_event(topic)).status_code == 200


def test_accepts_uppercase_hex():
    body = make_event()
    ts = int(time.time())
    assert send(body, signature=sign(body, ts).upper(), timestamp=ts).status_code == 200


def test_accepts_any_content_type():
    assert send(make_event(), content_type="text/plain").status_code == 200


def test_rejects_tampered_body():
    body = make_event()
    ts = int(time.time())
    res = send(body.replace(b"Dark mode", b"Light mode"), signature=sign(body, ts), timestamp=ts)
    assert res.status_code == 401


def test_rejects_other_secret():
    body = make_event()
    ts = int(time.time())
    assert send(body, signature=sign(body, ts, "whsec_other"), timestamp=ts).status_code == 401


def test_uses_whole_secret():
    body = make_event()
    ts = int(time.time())
    stripped = SECRET[len("whsec_"):]
    assert send(body, signature=sign(body, ts, stripped), timestamp=ts).status_code == 401
    decoded = hmac.new(
        base64.b64decode(stripped), str(ts).encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    assert send(body, signature=decoded, timestamp=ts).status_code == 401


def test_rejects_changed_timestamp_header():
    body = make_event()
    ts = int(time.time())
    assert send(body, signature=sign(body, ts), timestamp=ts + 1).status_code == 401


def test_rejects_missing_or_empty_headers():
    assert send(make_event(), signature=None).status_code == 401
    assert send(make_event(), signature="").status_code == 401
    assert send(make_event(), signature="a" * 64, timestamp=None).status_code == 401


@pytest.mark.parametrize(
    "signature",
    [
        "abc123",
        "a" * 65,
        "z" * 64,
        "sha256=" + "a" * 64,
        base64.b64encode(b"\x01" * 32).decode(),
        "a" * 64 + "\n",
    ],
)
def test_rejects_malformed_signature(signature):
    assert send(make_event(), signature=signature).status_code == 401


def test_old_timestamp_accepted_by_default():
    old = int(time.time()) - 3600
    assert send(make_event(), timestamp=old).status_code == 200


def test_tolerance_rejects_old_timestamp(monkeypatch):
    monkeypatch.setenv("FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS", "300")
    old = int(time.time()) - 3600
    assert send(make_event(), timestamp=old).status_code == 401
    assert send(make_event()).status_code == 200


def test_tolerance_zero_is_off(monkeypatch):
    monkeypatch.setenv("FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS", "0")
    old = int(time.time()) - 3600
    assert send(make_event(), timestamp=old).status_code == 200


def test_signed_non_json_returns_400():
    assert send(b"not json", content_type="text/plain").status_code == 400


def test_dedupes_retried_event():
    body = make_event()
    assert "duplicate" not in send(body).json()
    assert send(body).json()["duplicate"] is True


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("FEATUREBASE_WEBHOOK_SECRET")
    assert send(make_event()).status_code == 500
