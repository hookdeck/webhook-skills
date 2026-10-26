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
    return json.dumps({
        "type": event_type,
        "timestamp": "2026-09-30T10:00:00.000Z",
        "data": {"message_id": 48213, "to": "ada@example.com", "subject": "Reset your password", "tags": {"user_id": "42"}, **data},
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
        "/webhooks/nitrosend",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


# Event names as documented at https://docs.nitrosend.com/integrations/webhooks
EVENTS = [
    ("email.sent", {}),
    ("email.delivered", {}),
    ("email.bounced", {"bounce": {"type": "hard", "subtype": "NoEmail"}}),
    ("email.complained", {}),
    ("email.opened", {}),
    ("email.clicked", {}),
    ("email.failed", {}),
    ("email.received", {"from": "ada@example.com", "to": "support@yourbrand.com", "subject": "Re: Your receipt", "text": "Hi", "html": "<p>Hi</p>", "truncated": False, "auto_submitted": False, "attachments": [], "conversation_id": 9021, "conversation_message_id": 55410}),
    ("campaign.completed", {}),
    ("campaign.failed", {}),
    ("campaign.stopped", {}),
    ("flow.paused", {}),
    ("sending.paused", {}),
    ("sending.limit_approaching", {}),
    ("sending.limit_reached", {}),
    ("import.completed", {}),
    ("import.failed", {}),
    ("domain.verified", {}),
    ("domain.verification_lost", {}),
    ("domain.dns_degraded", {}),
    ("webhook.disabled", {}),
]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("NITROSEND_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("event_type,data", EVENTS)
def test_handles_event(event_type, data):
    res = send(envelope(event_type, **data))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": event_type}


def test_handles_test_event():
    res = send(envelope("email.delivered", test=True, message_id=None))
    assert res.status_code == 200
    assert res.json()["type"] == "email.delivered"


def test_acknowledges_unhandled_event():
    res = send(envelope("contact.created"))
    assert res.status_code == 200
    assert res.json()["type"] == "contact.created"


def test_accepts_svix_prefixed_headers():
    res = send(envelope("email.delivered"), prefix="svix")
    assert res.status_code == 200
    assert res.json()["type"] == "email.delivered"


def test_prefers_webhook_headers_when_both_present():
    payload = envelope("email.delivered")
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
    assert send(envelope("email.delivered"), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_with_odd_whitespace():
    payload = '{ "type" : "email.sent",\n "timestamp":"2026-09-30T10:00:00.000Z", "data":{"message_id":1, "to":"a@b.co"} }'
    assert send(payload).status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = envelope("email.bounced", bounce={"type": "hard"})
    ts = now()
    good = sign(payload, "evt_multi", ts)
    bad = sign(payload, "evt_multi", ts, OTHER_SECRET)
    res = send(payload, evt_id="evt_multi", timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = send(envelope("email.delivered"), headers={"webhook-id": "evt_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(envelope("email.delivered"), headers={}).status_code == 400


def test_rejects_invalid_signature():
    assert send(envelope("email.delivered"), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_malformed_signature_entry():
    assert send(envelope("email.delivered"), signature="not-a-signature").status_code == 401


def test_rejects_signature_made_with_another_secret():
    payload = envelope("email.delivered")
    ts = now()
    res = send(payload, evt_id="evt_other_secret", timestamp=ts, signature=sign(payload, "evt_other_secret", ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    signature = sign(envelope("email.delivered"), "evt_tamper", ts)
    res = send(envelope("email.bounced"), evt_id="evt_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    # The library window is a fixed 5 minutes
    ts = str(int(time.time()) - 600)
    assert send(envelope("email.delivered"), evt_id="evt_stale", timestamp=ts).status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("NITROSEND_WEBHOOK_SECRET")
    assert send(envelope("email.delivered")).status_code == 500


def test_fails_closed_when_secret_is_not_whsec(monkeypatch):
    monkeypatch.setenv("NITROSEND_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(envelope("email.delivered")).status_code == 500
