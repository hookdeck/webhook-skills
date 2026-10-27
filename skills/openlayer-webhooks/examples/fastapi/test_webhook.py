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


def sign(payload: str, evt_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Standard Webhooks: base64(HMAC-SHA256(decoded secret, '{id}.{timestamp}.{body}'))."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{evt_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def envelope(event_type: str, **data) -> str:
    body = {"test": {"id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "name": "No duplicate rows", "type": "integrity"}}
    body.update(data)
    return json.dumps({
        "type": event_type,
        "timestamp": "2026-01-21T10:30:00Z",
        "data": {k: v for k, v in body.items() if v is not None},
    })


def send(payload: str, evt_id=None, timestamp=None, signature=None, content_type="application/json", prefix="webhook", headers=None):
    evt_id = evt_id or f"evt_{uuid.uuid4().hex[:24]}"
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            f"{prefix}-id": evt_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, evt_id, timestamp),
        }
    return client.post(
        "/webhooks/openlayer",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


# Event names as documented at https://docs.openlayer.com/security/webhooks/events
EVENTS = [
    ("test.created", {}),
    ("test.updated", {}),
    ("test.deleted", {"test": {"id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}}),
    ("tests.result.updated", {"test": None, "tests": {"projectId": "p1", "projectVersionId": None, "inferencePipelineId": None, "total": 6, "passing": 4, "failing": 1, "skipped": 1, "running": 0}}),
]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("OPENLAYER_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("event_type,data", EVENTS)
def test_handles_event(event_type, data):
    res = send(envelope(event_type, **data))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": event_type}


def test_acknowledges_unhandled_event():
    res = send(envelope("project.created"))
    assert res.status_code == 200
    assert res.json()["type"] == "project.created"


def test_accepts_svix_prefixed_headers():
    res = send(envelope("test.created"), prefix="svix")
    assert res.status_code == 200
    assert res.json()["type"] == "test.created"


def test_prefers_webhook_headers_when_both_present():
    payload = envelope("test.created")
    ts = now()
    res = send(
        payload,
        headers={
            "webhook-id": "evt_both",
            "webhook-timestamp": ts,
            "webhook-signature": sign(payload, "evt_both", ts),
            "svix-id": "evt_other",
            "svix-timestamp": ts,
            "svix-signature": "v1,AAAA",
        },
    )
    assert res.status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    assert send(envelope("test.created"), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_with_odd_whitespace():
    payload = '{ "type" : "test.updated",\n "timestamp":"2026-09-30T10:00:00.000Z", "data":{"test":{"id":"t1"}} }'
    assert send(payload).status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = envelope("test.deleted")
    ts = now()
    good = sign(payload, "evt_multi", ts)
    bad = sign(payload, "evt_multi", ts, OTHER_SECRET)
    res = send(payload, evt_id="evt_multi", timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = send(envelope("test.created"), headers={"webhook-id": "evt_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(envelope("test.created"), headers={}).status_code == 400


def test_rejects_invalid_signature():
    assert send(envelope("test.created"), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_malformed_signature_entry():
    assert send(envelope("test.created"), signature="not-a-signature").status_code == 401


def test_rejects_signature_made_with_another_secret():
    payload = envelope("test.created")
    ts = now()
    res = send(payload, evt_id="evt_other_secret", timestamp=ts, signature=sign(payload, "evt_other_secret", ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    signature = sign(envelope("test.created"), "evt_tamper", ts)
    res = send(envelope("test.deleted"), evt_id="evt_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    # The library window is a fixed 5 minutes
    ts = str(int(time.time()) - 600)
    assert send(envelope("test.created"), evt_id="evt_stale", timestamp=ts).status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("OPENLAYER_WEBHOOK_SECRET")
    assert send(envelope("test.created")).status_code == 500


def test_fails_closed_when_secret_is_not_whsec(monkeypatch):
    monkeypatch.setenv("OPENLAYER_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(envelope("test.created")).status_code == 500
