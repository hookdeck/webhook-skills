# Generated with: beehiiv-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from main import app, processed_event_ids

# Svix-style secret: "whsec_" + base64 of the key bytes
SECRET = "whsec_" + base64.b64encode(b"beehiiv-test-signing-key-01234567").decode()

client = TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("BEEHIIV_WEBHOOK_SECRET", SECRET)
    processed_event_ids.clear()


def sign(body: bytes, msg_id: str, ts: str, secret: str = SECRET) -> str:
    """Sign exactly like Svix: HMAC-SHA256 over id.timestamp.body, base64."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def envelope(event_type: str, data=None, uid=None) -> bytes:
    return json.dumps(
        {
            "uid": uid or f"evt_{uuid.uuid4()}",
            "event_type": event_type,
            "event_timestamp": 1792922400,
            "data": data or {},
        }
    ).encode()


def post(body: bytes, *, msg_id=None, ts=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(ts if ts is not None else int(time.time()))
    return client.post(
        "/webhooks/beehiiv",
        content=body,
        headers={
            "content-type": content_type,
            "svix-id": msg_id,
            "svix-timestamp": ts,
            "svix-signature": signature or sign(body, msg_id, ts, secret),
        },
    )


EVENTS = [
    "post.sent",
    "post.updated",
    "post.scheduled",
    "subscription.created",
    "subscription.confirmed",
    "subscription.deleted",
    "subscription.upgraded",
    "subscription.downgraded",
    "subscription.paused",
    "subscription.resumed",
    "newsletter_list_subscription.subscribed",
    "survey.response_submitted",
    "podcasts.episode.published",
    "something.new",
]


@pytest.mark.parametrize("event_type", EVENTS)
def test_valid_event_returns_200(event_type):
    res = post(envelope(event_type, {"id": "x_1", "email": "ada@example.com"}))
    assert res.status_code == 200
    assert res.json()["received"] is True


def test_any_content_type_verifies():
    assert post(envelope("post.sent"), content_type="application/vnd.beehiiv+json").status_code == 200


def test_any_matching_v1_entry_accepted():
    body = envelope("post.sent")
    msg_id, ts = "msg_multi", str(int(time.time()))
    header = "v1," + base64.b64encode(b"nope").decode() + " " + sign(body, msg_id, ts)
    assert post(body, msg_id=msg_id, ts=ts, signature=header).status_code == 200


def test_duplicate_uid_acknowledged_once():
    body = envelope("post.sent", uid="evt_dup")
    assert post(body).status_code == 200
    res = post(body)
    assert res.status_code == 200
    assert res.json()["duplicate"] is True


def test_wrong_secret_400():
    other = "whsec_" + base64.b64encode(b"other-key").decode()
    assert post(envelope("post.sent"), secret=other).status_code == 400


def test_tampered_body_400():
    body = envelope("post.sent")
    msg_id, ts = "msg_t", str(int(time.time()))
    sig = sign(body, msg_id, ts)
    assert post(body + b" ", msg_id=msg_id, ts=ts, signature=sig).status_code == 400


def test_stale_timestamp_400():
    assert post(envelope("post.sent"), ts=int(time.time()) - 3600).status_code == 400


def test_missing_headers_400():
    res = client.post("/webhooks/beehiiv", content=envelope("post.sent"))
    assert res.status_code == 400


def test_missing_secret_500(monkeypatch):
    monkeypatch.delenv("BEEHIIV_WEBHOOK_SECRET")
    assert post(envelope("post.sent")).status_code == 500


def test_health():
    assert client.get("/health").status_code == 200
