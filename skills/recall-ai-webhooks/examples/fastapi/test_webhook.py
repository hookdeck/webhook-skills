import base64
import hashlib
import hmac
import json
import os
import time

# Recall.ai secrets are "whsec_" + base64 of the raw HMAC key (Standard Webhooks format)
SECRET = "whsec_" + base64.b64encode(b"recall-ai-test-secret-key-32byte").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"another-recall-secret-key-32byte").decode()
os.environ["RECALL_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_recall_signature

client = TestClient(app)


def sign(msg_id: str, timestamp: int, payload: str, secret: str = SECRET) -> str:
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def signed_headers(
    payload: str,
    prefix: str = "webhook",
    secrets: list[str] | None = None,
    msg_id: str = "msg_loFOjxBNrRLzqYUf",
    timestamp: int | None = None,
) -> dict[str, str]:
    t = int(time.time()) if timestamp is None else timestamp
    return {
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": str(t),
        f"{prefix}-signature": " ".join(f"v1,{sign(msg_id, t, payload, s)}" for s in (secrets or [SECRET])),
    }


def post(payload: str, headers: dict[str, str]):
    return client.post(
        "/webhooks/recall-ai",
        content=payload,
        headers={"content-type": "application/json", **headers},
    )


BOT_DONE = json.dumps(
    {
        "event": "bot.done",
        "data": {
            "data": {"code": "done", "sub_code": None, "updated_at": "2026-10-21T12:00:00.000Z"},
            "bot": {"id": "8b6e2f6a-4f1c-4d2a-9d2e-1c3b5a7d9e0f", "metadata": {}},
        },
    }
)


def test_accepts_valid_webhook_signature():
    res = post(BOT_DONE, signed_headers(BOT_DONE))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_legacy_svix_headers():
    res = post(BOT_DONE, signed_headers(BOT_DONE, prefix="svix"))
    assert res.status_code == 200


def test_accepts_any_matching_signature_during_rotation():
    res = post(BOT_DONE, signed_headers(BOT_DONE, secrets=[OTHER_SECRET, SECRET]))
    assert res.status_code == 200


def test_rejects_missing_headers():
    assert post(BOT_DONE, {}).status_code == 400


def test_rejects_wrong_secret():
    assert post(BOT_DONE, signed_headers(BOT_DONE, secrets=[OTHER_SECRET])).status_code == 400


def test_rejects_tampered_body():
    headers = signed_headers(BOT_DONE)
    assert post(BOT_DONE.replace("bot.done", "bot.fatal"), headers).status_code == 400


def test_rejects_reserialised_body():
    pretty = json.dumps(json.loads(BOT_DONE), indent=2)
    assert post(pretty, signed_headers(BOT_DONE)).status_code == 400


def test_rejects_stale_timestamp():
    headers = signed_headers(BOT_DONE, timestamp=int(time.time()) - 600)
    assert post(BOT_DONE, headers).status_code == 400


def test_ignores_non_v1_signatures():
    headers = signed_headers(BOT_DONE)
    headers["webhook-signature"] = headers["webhook-signature"].replace("v1,", "v2,")
    assert post(BOT_DONE, headers).status_code == 400


def test_rejects_malformed_base64_signature():
    headers = signed_headers(BOT_DONE)
    headers["webhook-signature"] = "v1,not-base64!!"
    assert post(BOT_DONE, headers).status_code == 400


@pytest.mark.parametrize(
    "event_type,data",
    [
        ("bot.joining_call", {"bot": {"id": "b1", "metadata": {}}, "data": {"code": "joining_call", "sub_code": None}}),
        ("bot.in_call_recording", {"bot": {"id": "b1", "metadata": {}}, "data": {"code": "in_call_recording", "sub_code": None}}),
        ("bot.call_ended", {"bot": {"id": "b1", "metadata": {}}, "data": {"code": "call_ended", "sub_code": "call_ended_by_host"}}),
        ("bot.fatal", {"bot": {"id": "b1", "metadata": {}}, "data": {"code": "fatal", "sub_code": "meeting_not_found"}}),
        ("recording.done", {"recording": {"id": "r1", "metadata": {}}, "bot": {"id": "b1", "metadata": {}}, "data": {"code": "done"}}),
        ("recording.failed", {"recording": {"id": "r1", "metadata": {}}, "data": {"code": "failed", "sub_code": "x"}}),
        ("transcript.done", {"transcript": {"id": "t1", "metadata": {}}, "recording": {"id": "r1"}, "data": {"code": "done"}}),
        ("transcript.failed", {"transcript": {"id": "t1", "metadata": {}}, "data": {"code": "failed", "sub_code": "x"}}),
        ("calendar.update", {"calendar_id": "c1"}),
        ("calendar.sync_events", {"calendar_id": "c1", "last_updated_ts": "2026-10-21T12:00:00Z"}),
        ("participant_events.join", {"data": {"participant": {"id": 1, "name": "Ada"}}, "bot": {"id": "b1"}}),
        ("transcript.data", {"data": {"words": []}, "bot": {"id": "b1"}}),
        ("audio_mixed.done", {"audio_mixed": {"id": "a1"}}),
    ],
)
def test_handles_events(event_type, data):
    payload = json.dumps({"event": event_type, "data": data})
    assert post(payload, signed_headers(payload)).status_code == 200


def test_rejects_secret_without_prefix():
    valid, _ = verify_recall_signature(BOT_DONE.encode(), signed_headers(BOT_DONE), "plain-secret")
    assert not valid


def test_skips_timestamp_window_when_tolerance_is_zero():
    headers = signed_headers(BOT_DONE, timestamp=1731705121)
    valid, _ = verify_recall_signature(BOT_DONE.encode(), headers, SECRET, tolerance_seconds=0)
    assert valid


def test_rejects_non_numeric_timestamp():
    headers = {**signed_headers(BOT_DONE), "webhook-timestamp": "abc"}
    valid, _ = verify_recall_signature(BOT_DONE.encode(), headers, SECRET)
    assert not valid
