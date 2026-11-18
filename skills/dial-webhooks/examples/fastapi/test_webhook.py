import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "whsec_test_dial_secret"
os.environ["DIAL_WEBHOOK_SECRET"] = SECRET
os.environ.pop("DIAL_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app  # noqa: E402

client = TestClient(app)

EVENTS = [
    ("message.received", {"messageId": "msg_1", "from": "+14155550123", "to": "+14155559876", "channel": "sms", "body": "hi", "media": []}),
    ("message.status_changed", {"messageId": "msg_1", "changed": "delivery", "deliveryState": "delivered", "readState": "unsupported"}),
    ("call.status_changed", {"callId": "call_1", "status": {"state": "Ringing", "label": "Ringing"}, "previousState": "Queued"}),
    ("call.ended", {"callId": "call_1", "direction": "inbound", "durationSeconds": 47, "status": "completed", "canceled": False}),
    ("call.transcribed", {"callId": "call_1"}),
    ("number.status_changed", {"phoneNumberId": "pn_1", "number": "+14155550123", "status": "ready", "changed": [], "capabilities": {}}),
    ("webhook.ping", {}),
]


def now() -> int:
    return int(time.time())


def sign(body: bytes, t: int | None = None, secret: str = SECRET) -> str:
    # t=<ts>,v1=<hex HMAC-SHA256 of f"{t}.{body}">, keyed with the full whsec_ secret
    t = now() if t is None else t
    v1 = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def envelope(event_type: str, data: dict | None = None) -> bytes:
    return json.dumps({
        "id": "evt_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90",
        "object": "event",
        "type": event_type,
        "version": 2 if event_type == "number.status_changed" else 1,
        "createdAt": "2026-05-28T14:32:08.412Z",
        "relatedObject": None,
        "data": data or {},
    }).encode()


def post(body: bytes, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Dial-Signature"] = signature
    return client.post("/webhooks/dial", content=body, headers=headers)


@pytest.fixture(autouse=True)
def reset_tolerance():
    yield
    os.environ.pop("DIAL_WEBHOOK_TOLERANCE_SECONDS", None)


@pytest.mark.parametrize("event_type,data", EVENTS)
def test_accepts_signed_event(event_type, data):
    body = envelope(event_type, data)
    assert post(body, sign(body)).status_code == 200


def test_accepts_uppercase_hex():
    body = envelope("webhook.ping")
    t = now()
    v1 = sign(body, t).split("v1=")[1]
    assert post(body, f"t={t},v1={v1.upper()}").status_code == 200


def test_accepts_any_matching_v1_entry():
    body = envelope("call.ended")
    t = now()
    good = sign(body, t).split(",")[1]
    assert post(body, f"t={t},v1={'0' * 64},{good}").status_code == 200


def test_rejects_wrong_secret():
    body = envelope("message.received")
    assert post(body, sign(body, secret="whsec_other")).status_code == 401


def test_rejects_secret_without_prefix():
    body = envelope("message.received")
    assert post(body, sign(body, secret="test_dial_secret")).status_code == 401


def test_rejects_tampered_body():
    sig = sign(envelope("call.ended"))
    assert post(envelope("call.transcribed"), sig).status_code == 401


def test_rejects_stale_timestamp_by_default():
    body = envelope("call.ended")
    assert post(body, sign(body, now() - 600)).status_code == 401


def test_accepts_stale_timestamp_when_tolerance_disabled():
    os.environ["DIAL_WEBHOOK_TOLERANCE_SECONDS"] = "0"
    body = envelope("call.ended")
    assert post(body, sign(body, now() - 86400)).status_code == 200


def test_rejects_malformed_signatures():
    body = envelope("call.ended")
    t = now()
    v1 = sign(body, t).split("v1=")[1]
    for bad in [v1, f"t={t}", f"v1={v1}", f"t=abc,v1={v1}", f"t={t},v1={'zz' * 32}", f"t={t},v1={v1[:62]}", f"t={t + 1},v1={v1}"]:
        assert post(body, bad).status_code == 401


def test_non_ascii_signature_is_401_not_500():
    body = envelope("call.ended")
    response = client.post(
        "/webhooks/dial",
        content=body,
        headers={"Content-Type": "application/json", "X-Dial-Signature": f"t={now()},v1=é".encode("latin-1")},
    )
    assert response.status_code == 401


def test_missing_signature_is_400():
    assert post(envelope("call.ended")).status_code == 400


def test_signed_invalid_json_is_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
