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

# Helcim's verifierToken is bare base64 (no whsec_ prefix); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="
OTHER_SECRET = "b3RoZXJfc2VjcmV0X2tleQ=="


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Standard Webhooks: base64(HMAC-SHA256(base64-decoded token, '{id}.{timestamp}.{body}'))."""
    key = base64.b64decode(secret)
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def card_transaction() -> str:
    return json.dumps({"id": "25764674", "type": "cardTransaction"})


def terminal_cancel() -> str:
    return json.dumps(
        {
            "data": {
                "cancelledAt": "2026-01-14T18:38:18Z",
                "currency": "CAD",
                "customerCode": "",
                "deviceCode": "NBL7",
                "invoiceNumber": "",
                "transactionAmount": 1,
            },
            "type": "terminalCancel",
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
        "/webhooks/helcim",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("HELCIM_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


def test_handles_card_transaction():
    res = send(card_transaction())
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "cardTransaction"}


def test_handles_terminal_cancel():
    res = send(terminal_cancel())
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "terminalCancel"}


def test_acknowledges_unhandled_event():
    res = send(json.dumps({"type": "somethingNew"}))
    assert res.status_code == 200
    assert res.json()["type"] == "somethingNew"


def test_accepts_svix_prefixed_headers():
    res = send(card_transaction(), prefix="svix")
    assert res.status_code == 200
    assert res.json()["type"] == "cardTransaction"


def test_prefers_webhook_headers_when_both_present():
    payload = card_transaction()
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


def test_accepts_same_token_configured_with_whsec_prefix(monkeypatch):
    monkeypatch.setenv("HELCIM_WEBHOOK_SECRET", f"whsec_{TEST_SECRET}")
    assert send(card_transaction()).status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    assert send(card_transaction(), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_with_odd_whitespace():
    assert send('{ "id" : "25764674",\n "type":"cardTransaction" }').status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = card_transaction()
    ts = now()
    good = sign(payload, "msg_multi", ts)
    bad = sign(payload, "msg_multi", ts, OTHER_SECRET)
    res = send(payload, msg_id="msg_multi", timestamp=ts, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    res = send(card_transaction(), headers={"webhook-id": "msg_1", "webhook-timestamp": now()})
    assert res.status_code == 400


def test_rejects_request_with_no_webhook_headers():
    assert send(card_transaction(), headers={}).status_code == 400


def test_rejects_invalid_signature():
    assert send(card_transaction(), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_malformed_signature_entry():
    assert send(card_transaction(), signature="not-a-signature").status_code == 401


def test_rejects_signature_made_with_another_token():
    payload = card_transaction()
    ts = now()
    res = send(payload, msg_id="msg_other_secret", timestamp=ts, signature=sign(payload, "msg_other_secret", ts, OTHER_SECRET))
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    signature = sign(card_transaction(), "msg_tamper", ts)
    res = send(terminal_cancel(), msg_id="msg_tamper", timestamp=ts, signature=signature)
    assert res.status_code == 401


def test_rejects_stale_timestamp():
    # The library window is a fixed 5 minutes
    ts = str(int(time.time()) - 600)
    assert send(card_transaction(), msg_id="msg_stale", timestamp=ts).status_code == 401


def test_returns_400_for_verified_body_that_is_not_json():
    assert send("not json").status_code == 400


def test_fails_closed_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("HELCIM_WEBHOOK_SECRET")
    assert send(card_transaction()).status_code == 500
