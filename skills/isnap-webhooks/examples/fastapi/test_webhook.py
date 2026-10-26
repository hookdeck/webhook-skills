import base64
import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="
OTHER_SECRET = "whsec_b3RoZXJfc2VjcmV0X2tleQ=="


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Standard Webhooks: base64(HMAC-SHA256(decoded secret, '{id}.{timestamp}.{body}'))."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:24]}"


def envelope(event_type: str, id: str = None, **data) -> str:
    return json.dumps(
        {
            "api_version": "v1",
            "event_id": id or event_id(),
            "event_type": event_type,
            "created_at": "2026-10-08T14:22:57.143Z",
            "trace_id": "174b4a27e4e4938fa67ea87b23a18579",
            "data": {**data, "metadata": None, "line_metadata": None},
        }
    )


def send(payload: str, msg_id=None, timestamp=None, signature=None, content_type="application/json", prefix="webhook", headers=None):
    msg_id = msg_id or event_id()
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        }
    return client.post(
        "/webhooks/isnap",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


# The 37 documented event types
EVENTS = [
    "message.queued", "message.scheduled", "message.sent", "message.delivered", "message.read",
    "message.failed", "message.received", "message.cancelled", "message.fallback_triggered",
    "reaction.added", "reaction.received", "reaction.removed",
    "typing_indicator.started", "typing_indicator.stopped",
    "line.connected", "line.disconnected", "line.offline", "line.degraded", "line.apple_id_flagged",
    "line.quota_warning", "line.quota_exceeded", "line.capability_changed", "line.terminated",
    "line.variant_changed", "line.variant_scheduled", "line.variant_unscheduled",
    "trial.linked", "trial.dormant", "trial.reactivated", "trial.bind_conflict", "trial.revoked",
    "pre_order.fulfilled", "pre_order.cancelled",
    "macos_session.rented", "macos_session.released",
    "binding.released",
    "webhook.test",
]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("ISNAP_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


def test_signing_matches_documented_test_vector():
    body = (
        '{"api_version":"v1","event_id":"evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D","event_type":"webhook.test",'
        '"created_at":"2025-10-09T08:53:20.000Z","trace_id":"0af7651916cd43dd8448eb211c80319c",'
        '"data":{"webhook_id":"11111111-2222-3333-4444-555555555555","probe":true,"metadata":null,"line_metadata":null}}'
    )
    secret = "whsec_00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
    assert sign(body, "evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D", "1760000000", secret) == (
        "v1,ushTjsgTdwRRBRQL1d56b6HFFwfVHNqiwwtkAn0HlsI="
    )


@pytest.mark.parametrize("event_type", EVENTS)
def test_acknowledges_event_with_empty_204(event_type, capsys):
    res = send(envelope(event_type))
    assert res.status_code == 204
    assert res.content == b""
    assert "Unhandled event type" not in capsys.readouterr().out


def test_routes_message_received(capsys):
    res = send(envelope("message.received", message={"id": "msg_abc"}, chat_id="chat_xyz"))
    assert res.status_code == 204
    assert "Message received: msg_abc in chat chat_xyz" in capsys.readouterr().out


def test_acknowledges_unknown_event(capsys):
    res = send(envelope("future.event"))
    assert res.status_code == 204
    assert "Unhandled event type: future.event" in capsys.readouterr().out


def test_processes_redelivered_event_once(capsys):
    eid = event_id()
    payload = envelope("message.delivered", id=eid, message={"id": "msg_dup"})
    assert send(payload, msg_id=eid).status_code == 204
    assert send(payload, msg_id=eid).status_code == 204
    out = capsys.readouterr().out
    assert out.count("Message status message.delivered: msg_dup") == 1
    assert f"Duplicate iSnap event {eid}" in out


def test_accepts_svix_prefixed_headers():
    res = send(envelope("message.received"), prefix="svix")
    assert res.status_code == 204


def test_prefers_webhook_headers_when_both_present():
    payload = envelope("message.received")
    msg_id = event_id()
    ts = now()
    res = send(
        payload,
        headers={
            "webhook-id": msg_id,
            "webhook-timestamp": ts,
            "webhook-signature": sign(payload, msg_id, ts),
            "svix-id": "evt_other",
            "svix-timestamp": ts,
            "svix-signature": "v1,AAAA",
        },
    )
    assert res.status_code == 204


def test_verifies_raw_bytes_whatever_the_content_type():
    res = send(envelope("message.received"), content_type="text/plain")
    assert res.status_code == 204


def test_verifies_exact_raw_bytes_including_odd_whitespace():
    payload = (
        f'{{ "api_version" : "v1",\n "event_id":"{event_id()}", "event_type":"message.sent", '
        '"data":{"metadata":null,"line_metadata":null} }'
    )
    assert send(payload).status_code == 204


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = envelope("line.offline")
    msg_id, ts = event_id(), now()
    good = sign(payload, msg_id, ts)
    bad = sign(payload, msg_id, ts, OTHER_SECRET)
    res = send(payload, msg_id=msg_id, timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 204


def test_accepts_old_secret_while_a_rotation_list_is_configured(monkeypatch):
    monkeypatch.setenv("ISNAP_WEBHOOK_SECRET", f"{OTHER_SECRET}, {TEST_SECRET}")
    assert send(envelope("message.received")).status_code == 204


def test_rejects_missing_signature_header():
    res = send(envelope("message.received"), headers={"webhook-id": "evt_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(envelope("message.received"), headers={}).status_code == 400


def test_rejects_invalid_signature_with_401_never_410():
    res = send(envelope("message.received"), signature="v1,aW52YWxpZA==")
    assert res.status_code == 401


def test_rejects_malformed_signature_entry():
    res = send(envelope("message.received"), signature="v1,!!!not-base64!!!")
    assert res.status_code == 401


def test_rejects_signature_made_with_another_secret():
    payload = envelope("message.received")
    msg_id, ts = event_id(), now()
    res = send(payload, msg_id=msg_id, timestamp=ts, signature=sign(payload, msg_id, ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    msg_id, ts = event_id(), now()
    signature = sign(envelope("message.received"), msg_id, ts)
    res = send(envelope("message.failed"), msg_id=msg_id, timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    payload = envelope("message.received")
    msg_id = event_id()
    ts = str(int(time.time()) - 600)
    res = send(payload, msg_id=msg_id, timestamp=ts, signature=sign(payload, msg_id, ts))
    assert res.status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("ISNAP_WEBHOOK_SECRET")
    assert send(envelope("message.received")).status_code == 500


def test_fails_closed_when_secret_is_not_a_whsec_secret(monkeypatch):
    monkeypatch.setenv("ISNAP_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(envelope("message.received")).status_code == 500
