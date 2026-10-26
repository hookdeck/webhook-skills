import base64
import hashlib
import hmac
import json
import os
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app, secret_to_key, verify_incident_io_signature

# Standard Webhooks secrets are "whsec_" + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm incident.io (Svix) uses: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}"))."""
    if secret.startswith("whsec_"):
        key = base64.b64decode(secret[len("whsec_"):])
    else:
        key = secret.encode("utf-8")
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id=None, timestamp=None, signature=None, secret=TEST_SECRET, headers=None):
    msg_id = msg_id or f"msg_{secrets.token_hex(12)}"
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            "webhook-id": msg_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signature or sign(payload, msg_id, timestamp, secret),
        }
    return client.post(
        "/webhooks/incident-io",
        content=payload.encode("utf-8"),
        headers={"content-type": "application/json", **headers},
    )


def envelope(event_type: str, resource) -> str:
    return json.dumps({"event_type": event_type, event_type: resource})


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("INCIDENT_IO_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.delenv("INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS", raising=False)


@pytest.mark.parametrize(
    "event_type,resource",
    [
        ("public_incident.incident_created_v2", {"id": "inc1", "reference": "INC-123", "name": "Our database is sad", "incident_status": {"name": "Triage"}}),
        ("public_incident.incident_status_updated_v2", {"incident": {"reference": "INC-123"}, "previous_status": {"name": "Triage"}, "new_status": {"name": "Closed"}}),
        ("public_incident.follow_up_created_v2", {"id": "fu1", "incident_id": "inc1", "status": "outstanding"}),
        ("public_alert.alert_created_v1", {"id": "al1", "title": "PG::Error failed to connect", "status": "firing"}),
        ("public_escalation.escalation_status_updated_v1", {"escalation": {"id": "esc1"}, "previous_status": "pending", "new_status": "acked"}),
        ("schedule.shift_change_v1", {"schedule": {"name": "Primary"}, "current_users": [{"name": "Lisa"}], "previous_users": []}),
        ("status_page_incident.update_shared_v1", {"status_page_incident": {"name": "Elevated API latency", "incident_status": "investigating"}}),
    ],
)
def test_accepts_signed_event_and_reads_resource(event_type, resource, capsys):
    res = send(envelope(event_type, resource))
    assert res.status_code == 200
    assert res.json() == {"received": True, "eventType": event_type}
    assert "None" not in capsys.readouterr().out


def test_private_event_is_id_only(capsys):
    res = send(envelope("private_incident.incident_created_v2", {"id": "abc123"}))
    assert res.status_code == 200
    assert "private resource abc123" in capsys.readouterr().out


def test_private_membership_event(capsys):
    payload = envelope(
        "private_incident.membership_granted_v1",
        {"actor_user_id": "u0", "incident_id": "inc1", "user_id": "u1"},
    )
    res = send(payload)
    assert res.status_code == 200
    assert "user u1 on incident inc1" in capsys.readouterr().out


def test_unknown_event_type_returns_200():
    assert send(envelope("public_incident.something_new_v9", {"id": "x"})).status_code == 200


def test_unprefixed_secret_used_as_utf8(monkeypatch):
    monkeypatch.setenv("INCIDENT_IO_WEBHOOK_SECRET", "plain-text-secret")
    res = send(envelope("schedule.created_v1", {"id": "s1", "name": "Primary"}), secret="plain-text-secret")
    assert res.status_code == 200


def test_any_v1_entry_matches_during_rotation():
    payload = envelope("schedule.updated_v1", {"id": "s1", "name": "Primary"})
    ts = now()
    old = sign(payload, "msg_rotation", ts, "whsec_b2xkX3NlY3JldF9rZXk=")
    current = sign(payload, "msg_rotation", ts)
    res = send(payload, msg_id="msg_rotation", timestamp=ts, signature=f"{old} {current}")
    assert res.status_code == 200


def test_ignores_non_v1_versions():
    payload = envelope("schedule.deleted_v1", {"id": "s1"})
    ts = now()
    digest = sign(payload, "msg_version", ts)[len("v1,"):]
    res = send(payload, msg_id="msg_version", timestamp=ts, signature=f"v1a,{digest} v2,{digest}")
    assert res.status_code == 400


def test_rejects_tampered_body():
    payload = envelope("public_alert.alert_resolved_v1", {"id": "al1"})
    ts = now()
    signature = sign(payload, "msg_tamper", ts)
    res = send(payload.replace("al1", "al2"), msg_id="msg_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_wrong_secret():
    payload = envelope("public_alert.alert_created_v1", {"id": "al1"})
    ts = now()
    res = send(payload, msg_id="msg_wrong", timestamp=ts, signature=sign(payload, "msg_wrong", ts, "whsec_d3Jvbmc="))
    assert res.status_code == 400


def test_rejects_junk_appended_to_valid_digest():
    payload = envelope("public_alert.alert_created_v1", {"id": "al1"})
    ts = now()
    res = send(payload, msg_id="msg_junk", timestamp=ts, signature=sign(payload, "msg_junk", ts) + "junk")
    assert res.status_code == 400


def test_non_ascii_signature_header_returns_400_not_500():
    payload = envelope("public_alert.alert_created_v1", {"id": "al1"})
    # httpx only sends str headers as ASCII, so pass raw latin-1 bytes
    res = send(payload, signature="v1,ééé".encode("latin-1"))
    assert res.status_code == 400


def test_rejects_missing_headers():
    res = send(envelope("schedule.created_v1", {"id": "s1"}), headers={})
    assert res.status_code == 400
    assert res.json()["detail"] == "Missing required webhook headers"


@pytest.mark.parametrize("ts", ["abc", "-5", "1676033031.5", "0"])
def test_rejects_malformed_timestamp(ts):
    res = send(envelope("schedule.created_v1", {"id": "s1"}), timestamp=ts)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid webhook-timestamp"


def test_old_timestamp_accepted_without_tolerance():
    old = str(int(time.time()) - 6 * 3600)
    assert send(envelope("schedule.created_v1", {"id": "s1"}), timestamp=old).status_code == 200


def test_old_timestamp_rejected_with_tolerance(monkeypatch):
    monkeypatch.setenv("INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS", "300")
    old = str(int(time.time()) - 600)
    res = send(envelope("schedule.created_v1", {"id": "s1"}), timestamp=old)
    assert res.status_code == 400
    assert res.json()["detail"] == "Timestamp outside tolerance window"


def test_rejects_signed_invalid_json():
    res = send("not json")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON"


def test_rejects_missing_event_type():
    res = send(json.dumps({"data": {}}))
    assert res.status_code == 400
    assert res.json()["detail"] == "Missing event_type"


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("INCIDENT_IO_WEBHOOK_SECRET")
    assert send(envelope("schedule.created_v1", {"id": "s1"})).status_code == 500


def test_secret_to_key():
    assert secret_to_key(TEST_SECRET) == b"test_secret_key_for-webhooks"
    assert secret_to_key("abc") == b"abc"
    for bad in ["", "whsec_", "whsec_!!!!", None]:
        assert secret_to_key(bad) is None


def test_documented_signed_content_format():
    key = secret_to_key(TEST_SECRET)
    body = b'{"event_type":"schedule.created_v1"}'
    sig = base64.b64encode(hmac.new(key, b"123.1676033031." + body, hashlib.sha256).digest()).decode()
    assert verify_incident_io_signature(body, "123", "1676033031", f"v1,{sig}", key) is None
