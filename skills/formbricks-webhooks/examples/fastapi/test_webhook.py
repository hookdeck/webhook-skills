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


def envelope(event: str, finished: bool = False) -> str:
    return json.dumps(
        {
            "data": {
                "id": "responseId",
                "surveyId": "surveyId",
                "finished": finished,
                "data": {},
                "survey": {"title": "Customer Satisfaction Survey", "status": "inProgress", "type": "link"},
            },
            "event": event,
            "webhookId": "webhookId",
        }
    )


def send(payload: str, msg_id=None, timestamp=None, signature=None, content_type="application/json", prefix="webhook", headers=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex[:24]}"
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        }
    return client.post(
        "/webhooks/formbricks",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


EVENTS = ["responseCreated", "responseUpdated", "responseFinished"]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("FORMBRICKS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("event", EVENTS)
def test_handles_event(event):
    res = send(envelope(event))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event": event}


def test_acknowledges_unhandled_event():
    res = send(envelope("responseDeleted"))
    assert res.status_code == 200
    assert res.json()["event"] == "responseDeleted"


def test_accepts_svix_prefixed_headers():
    res = send(envelope("responseCreated"), prefix="svix")
    assert res.status_code == 200
    assert res.json()["event"] == "responseCreated"


def test_prefers_webhook_headers_when_both_present():
    payload = envelope("responseCreated")
    ts = now()
    res = send(
        payload,
        headers={
            "webhook-id": "msg_both",
            "webhook-timestamp": ts,
            "webhook-signature": sign(payload, "msg_both", ts),
            "svix-id": "msg_other",
            "svix-timestamp": ts,
            "svix-signature": "v1,AAAA",
        },
    )
    assert res.status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    assert send(envelope("responseCreated"), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_with_odd_whitespace():
    payload = '{ "event" : "responseCreated",\n "data":{"id":"r1", "surveyId":"s1"}, "webhookId":"w1" }'
    assert send(payload).status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = envelope("responseUpdated")
    ts = now()
    good = sign(payload, "msg_multi", ts)
    bad = sign(payload, "msg_multi", ts, OTHER_SECRET)
    res = send(payload, msg_id="msg_multi", timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = send(envelope("responseCreated"), headers={"webhook-id": "msg_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(envelope("responseCreated"), headers={}).status_code == 400


def test_rejects_invalid_signature():
    assert send(envelope("responseCreated"), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_malformed_signature_entry():
    assert send(envelope("responseCreated"), signature="not-a-signature").status_code == 401


def test_rejects_signature_made_with_another_secret():
    payload = envelope("responseCreated")
    ts = now()
    res = send(payload, msg_id="msg_other_secret", timestamp=ts, signature=sign(payload, "msg_other_secret", ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    signature = sign(envelope("responseCreated"), "msg_tamper", ts)
    res = send(envelope("responseFinished"), msg_id="msg_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    # The library window is a fixed 5 minutes
    ts = str(int(time.time()) - 600)
    assert send(envelope("responseCreated"), msg_id="msg_stale", timestamp=ts).status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("FORMBRICKS_WEBHOOK_SECRET")
    assert send(envelope("responseCreated")).status_code == 500


def test_fails_closed_when_secret_is_not_whsec(monkeypatch):
    monkeypatch.setenv("FORMBRICKS_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(envelope("responseCreated")).status_code == 500
