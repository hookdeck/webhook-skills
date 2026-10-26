import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Celitech (Svix) uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload, msg_id=None, timestamp=None, signature=None, prefix="svix", content_type="application/json"):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/celitech",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("CELITECH_WEBHOOK_SECRET", TEST_SECRET)


def test_consumption_threshold_reached():
    payload = json.dumps({
        "type": "consumption.threshold.reached",
        "purchaseId": "3f6c1c2e-0000-4000-8000-000000000001",
        "dataLimitInGB": 5,
        "dataUsageRemainingInGB": 1,
        "actualPercentage": 80,
        "notificationPercentage": 80,
    })
    res = send(payload)
    assert res.status_code == 200
    assert res.json() == {"success": True, "type": "consumption.threshold.reached"}


@pytest.mark.parametrize(
    "event_type",
    ["esim.downloaded", "esim.installed", "esim.enabled", "esim.disabled", "esim.deleted"],
)
def test_esim_events(event_type):
    res = send(json.dumps({"type": event_type, "iccid": "8910300000000000001"}))
    assert res.status_code == 200
    assert res.json() == {"success": True, "type": event_type}


def test_unknown_event_type_is_ok():
    res = send(json.dumps({"type": "esim.something-new"}))
    assert res.status_code == 200
    assert res.json()["type"] == "esim.something-new"


def test_accepts_webhook_prefixed_headers():
    res = send(json.dumps({"type": "esim.enabled", "iccid": "1"}), prefix="webhook")
    assert res.status_code == 200


def test_verifies_exact_bytes_whatever_the_content_type():
    res = send('{ "type":  "esim.deleted",\n "iccid": "1" }', content_type="text/plain")
    assert res.status_code == 200
    assert res.json()["type"] == "esim.deleted"


def test_accepts_any_matching_signature_among_several():
    payload = json.dumps({"type": "esim.enabled", "iccid": "1"})
    timestamp = now()
    signature = "v1,aW52YWxpZF9zaWduYXR1cmU= " + sign(payload, "msg_rotation", timestamp)
    res = send(payload, msg_id="msg_rotation", timestamp=timestamp, signature=signature)
    assert res.status_code == 200


def test_rejects_missing_headers():
    res = client.post("/webhooks/celitech", content="{}", headers={"content-type": "application/json"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    res = send('{"type":"esim.enabled"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_a_different_secret():
    payload = '{"type":"esim.enabled"}'
    timestamp = now()
    signature = sign(payload, "msg_other", timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    res = send(payload, msg_id="msg_other", timestamp=timestamp, signature=signature)
    assert res.status_code == 400


def test_rejects_tampered_body():
    timestamp = now()
    signature = sign('{"type":"esim.enabled","iccid":"1"}', "msg_tamper", timestamp)
    res = send('{"type":"esim.enabled","iccid":"2"}', msg_id="msg_tamper", timestamp=timestamp, signature=signature)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_timestamp_older_than_five_minutes():
    res = send('{"type":"esim.enabled"}', timestamp=str(int(time.time()) - 600))
    assert res.status_code == 400
    assert res.json()["detail"] == "Timestamp too old"


def test_fails_closed_when_secret_missing(monkeypatch):
    monkeypatch.delenv("CELITECH_WEBHOOK_SECRET", raising=False)
    res = send('{"type":"esim.enabled"}')
    assert res.status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
