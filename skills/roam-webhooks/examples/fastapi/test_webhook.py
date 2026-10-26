import base64
import hashlib
import hmac
import itertools
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Roam signing secrets are 'whsec_' + base64-encoded key bytes
WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"test_roam_signing_secret_key").decode()
os.environ["ROAM_WEBHOOK_SIGNING_SECRET"] = WEBHOOK_SECRET

from main import app  # noqa: E402

client = TestClient(app)

_ids = itertools.count(1)


def envelope(event_type: str, data: dict) -> dict:
    return {
        "type": event_type,
        "eventId": "0197f9a1-7d2e-7cc3-9f6a-8b1c2d3e4f5a",
        "timestamp": "2026-07-07T18:23:45.123456Z",
        "apiVersion": "2026-07-07",
        "data": data,
    }


CHAT_MESSAGE = envelope("chat.message", {"chatId": "c1", "userId": "u1", "version": 1, "text": "hi"})
CHAT_DELETED = envelope("chat.message", {"chatId": "c1", "userId": "u1", "version": 2, "contentType": "deleted"})
CHAT_REACTION = envelope("chat.reaction", {"chatId": "c1", "userId": "u1"})
MEETING_STARTED = envelope("meeting.started", {"id": "m1"})
MEETING_ENDED = envelope("meeting.ended", {"id": "m1", "title": "Weekly Team Standup", "hasVideo": True})
LOBBY_BOOKED = envelope("lobby.booked", {"lobbyId": "l1"})
MAGICAST_CREATED = envelope("magicast.created", {"id": "mg1"})
ONAIR_CREATED = envelope("onair.event.created", {"id": "e1"})
LEGACY_BODY = {"type": "message", "sender": "B-123", "chat": "D-456", "text": "hi"}


def sign(body: str, msg_id: str, timestamp: int, secret: str = WEBHOOK_SECRET) -> str:
    """Sign as Roam does (Standard Webhooks):
    base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
    """
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def post(payload, *, msg_id=None, timestamp=None, signature=None, secret=WEBHOOK_SECRET, omit=None,
         send_body=None, content_type="application/json"):
    body = json.dumps(payload)
    # Each call uses a fresh webhook-id unless a test is exercising dedupe
    msg_id = msg_id or f"msg_{next(_ids)}"
    ts = timestamp if timestamp is not None else int(time.time())
    headers = {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": signature or sign(body, msg_id, ts, secret),
    }
    if omit:
        del headers[omit]
    return client.post("/webhooks/roam", content=send_body or body, headers=headers)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("ROAM_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET)


@pytest.mark.parametrize(
    "payload",
    [CHAT_MESSAGE, CHAT_DELETED, CHAT_REACTION, MEETING_STARTED, MEETING_ENDED, LOBBY_BOOKED,
     MAGICAST_CREATED, ONAIR_CREATED],
    ids=["chat.message", "chat.message-deleted", "chat.reaction", "meeting.started", "meeting.ended",
         "lobby.booked", "magicast.created", "onair.event.created"],
)
def test_accepts_signed_event(payload):
    res = post(payload)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_any_content_type():
    res = post(CHAT_MESSAGE, content_type="text/plain")
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_when_one_of_several_signatures_matches():
    msg_id = f"msg_{next(_ids)}"
    ts = int(time.time())
    good = sign(json.dumps(CHAT_MESSAGE), msg_id, ts)
    res = post(CHAT_MESSAGE, msg_id=msg_id, timestamp=ts, signature=f"v1,aW52YWxpZHNpZ25hdHVyZQ== {good}")
    assert res.status_code == 200


def test_dedupes_repeated_webhook_id():
    msg_id = f"msg_{next(_ids)}"
    first = post(CHAT_MESSAGE, msg_id=msg_id)
    second = post(CHAT_MESSAGE, msg_id=msg_id)
    assert first.json() == {"received": True}
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


def test_skips_legacy_body_without_consuming_webhook_id():
    msg_id = f"msg_{next(_ids)}"
    legacy = post(LEGACY_BODY, msg_id=msg_id)
    v1 = post(CHAT_MESSAGE, msg_id=msg_id)
    assert legacy.json() == {"received": True, "ignored": "legacy body"}
    assert v1.json() == {"received": True}


def test_rejects_invalid_signature():
    assert post(CHAT_MESSAGE, signature="v1,aW52YWxpZHNpZ25hdHVyZQ==").status_code == 400


def test_rejects_signature_from_different_secret():
    other = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    assert post(CHAT_MESSAGE, secret=other).status_code == 400


def test_rejects_tampered_body():
    tampered = json.dumps({**CHAT_MESSAGE, "data": {**CHAT_MESSAGE["data"], "text": "tampered"}})
    assert post(CHAT_MESSAGE, send_body=tampered).status_code == 400


def test_rejects_old_timestamp():
    assert post(CHAT_MESSAGE, timestamp=int(time.time()) - 600).status_code == 400


@pytest.mark.parametrize("header", ["webhook-id", "webhook-timestamp", "webhook-signature"])
def test_rejects_missing_header(header):
    assert post(CHAT_MESSAGE, omit=header).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("ROAM_WEBHOOK_SIGNING_SECRET")
    assert post(CHAT_MESSAGE).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
