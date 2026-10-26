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


# Body shape and event names as documented at https://pganalyze.com/docs/checks/webhooks
def envelope(event_type: str, issue_state: str = "triggered") -> str:
    return json.dumps({
        "type": event_type,
        "id": "6f1c9a8e-2b3d-4e5f-9a1b-2c3d4e5f6a7b",
        "timestamp": "2026-10-14T17:02:11Z",
        "version": 1,
        "organization": {"id": "9a8e6f1c-9a1b-4e5f-2b3d-2c3f6a7bd4e5", "slug": "acme"},
        "data": {
            "endpoint": {"id": "42", "name": "Ops alert router"},
            "issue": {
                "id": "12345",
                "severity": "critical",
                "state": issue_state,
                "checkKind": "queries/slowness",
                "description": "Slow queries on prod-db",
                "url": "https://app.pganalyze.com/databases/678/checks/queries/slowness/12345",
            },
            "server": {"id": "abc123xyz", "name": "prod-db", "tags": {"env": "production"}},
            "database": {"id": "678", "name": "app_production"},
            "alertRules": [{"id": "7", "name": "Prod alerts"}],
            "alertDestinations": [{"id": "9", "name": "SRE Team"}],
        },
    })


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
        "/webhooks/pganalyze",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


EVENTS = [
    ("issue.triggered", "triggered"),
    ("issue.escalated", "triggered"),
    ("issue.downgraded", "triggered"),
    ("issue.acknowledged", "acknowledged"),
    ("issue.reopened", "triggered"),
    ("issue.resolved", "resolved"),
    ("ping", "triggered"),
]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("PGANALYZE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("event_type,issue_state", EVENTS)
def test_handles_event(event_type, issue_state):
    res = send(envelope(event_type, issue_state))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": event_type}


def test_acknowledges_unhandled_event():
    res = send(envelope("issue.snoozed"))
    assert res.status_code == 200
    assert res.json()["type"] == "issue.snoozed"


def test_accepts_svix_prefixed_headers():
    res = send(envelope("issue.triggered"), prefix="svix")
    assert res.status_code == 200
    assert res.json()["type"] == "issue.triggered"


def test_prefers_webhook_headers_when_both_present():
    payload = envelope("issue.triggered")
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
    assert send(envelope("issue.triggered"), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_with_odd_whitespace():
    payload = '{ "type" : "issue.triggered",\n "id":"evt_1", "data":{"issue":{"id":"1"}, "server" : {"name":"db"}} }'
    assert send(payload).status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = envelope("issue.escalated")
    ts = now()
    good = sign(payload, "msg_multi", ts)
    bad = sign(payload, "msg_multi", ts, OTHER_SECRET)
    res = send(payload, msg_id="msg_multi", timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = send(envelope("issue.triggered"), headers={"webhook-id": "msg_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(envelope("issue.triggered"), headers={}).status_code == 400


def test_rejects_invalid_signature():
    assert send(envelope("issue.triggered"), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_malformed_signature_entry():
    assert send(envelope("issue.triggered"), signature="not-a-signature").status_code == 401


def test_rejects_signature_made_with_another_secret():
    payload = envelope("issue.triggered")
    ts = now()
    res = send(payload, msg_id="msg_other_secret", timestamp=ts, signature=sign(payload, "msg_other_secret", ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    signature = sign(envelope("issue.triggered"), "msg_tamper", ts)
    res = send(envelope("issue.resolved"), msg_id="msg_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    # The library window is a fixed 5 minutes
    ts = str(int(time.time()) - 600)
    assert send(envelope("issue.triggered"), msg_id="msg_stale", timestamp=ts).status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("PGANALYZE_WEBHOOK_SECRET")
    assert send(envelope("issue.triggered")).status_code == 500


def test_fails_closed_when_secret_is_not_whsec(monkeypatch):
    monkeypatch.setenv("PGANALYZE_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(envelope("issue.triggered")).status_code == 500
