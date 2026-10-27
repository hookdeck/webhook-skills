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


def body(**extra) -> str:
    # The body format is not documented; this is an illustrative payload
    return json.dumps({"address": "0x66ec845c0b07d1728b1b14921d561fe7963a5ab8", "block_number": 31200, **extra})


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
        "/webhooks/prividium",
        content=payload.encode(),
        headers={"content-type": content_type, **headers},
    )


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("PRIVIDIUM_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").status_code == 200


def test_accepts_a_correctly_signed_delivery():
    res = send(body())
    assert res.status_code == 200
    assert res.json() == {"received": True, "duplicate": False}


def test_accepts_svix_prefixed_headers():
    res = send(body(), prefix="svix")
    assert res.status_code == 200
    assert res.json()["duplicate"] is False


def test_prefers_webhook_headers_when_both_sets_are_present():
    payload = body()
    timestamp = now()
    res = send(payload, headers={
        "webhook-id": "msg_both",
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(payload, "msg_both", timestamp),
        "svix-id": "msg_other",
        "svix-timestamp": timestamp,
        "svix-signature": "v1,AAAA",
    })
    assert res.status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    assert send(body(), content_type="text/plain").status_code == 200


def test_verifies_exact_raw_bytes_including_odd_whitespace():
    assert send('{ "block_number" : 1,\n "address":"0xabc" }').status_code == 200


def test_accepts_a_verified_body_that_is_not_json():
    assert send("not json").status_code == 200


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    payload = body()
    timestamp = now()
    good = sign(payload, "msg_multi", timestamp)
    bad = sign(payload, "msg_multi", timestamp, OTHER_SECRET)
    res = send(payload, msg_id="msg_multi", timestamp=timestamp, signature=f"v1a,ignored {bad} {good}")
    assert res.status_code == 200


def test_accepts_a_delivery_signed_with_either_key_listed_during_a_rotation(monkeypatch):
    monkeypatch.setenv("PRIVIDIUM_WEBHOOK_SECRET", f"{OTHER_SECRET},{TEST_SECRET}")
    assert send(body()).status_code == 200


def test_reports_a_repeated_webhook_id_as_a_duplicate():
    payload = body()
    timestamp = now()
    first = send(payload, msg_id="msg_dup", timestamp=timestamp)
    second = send(payload, msg_id="msg_dup", timestamp=timestamp)
    assert first.json()["duplicate"] is False
    assert second.status_code == 200
    assert second.json()["duplicate"] is True


def test_rejects_a_missing_signature_header():
    assert send(body(), headers={"webhook-id": "msg_1", "webhook-timestamp": now()}).status_code == 400


def test_rejects_a_request_with_no_webhook_headers():
    assert send(body(), headers={}).status_code == 400


def test_rejects_an_invalid_signature():
    assert send(body(), signature="v1,aW52YWxpZA==").status_code == 401


def test_rejects_a_signature_made_with_another_secret():
    payload = body()
    timestamp = now()
    signature = sign(payload, "msg_other_secret", timestamp, OTHER_SECRET)
    assert send(payload, msg_id="msg_other_secret", timestamp=timestamp, signature=signature).status_code == 401


def test_rejects_a_tampered_body():
    timestamp = now()
    signature = sign(body(), "msg_tamper", timestamp)
    assert send(body(block_number=99999), msg_id="msg_tamper", timestamp=timestamp, signature=signature).status_code == 401


def test_rejects_a_malformed_signature_entry():
    assert send(body(), signature="v1,%%%not-base64%%%").status_code == 401


def test_rejects_a_stale_timestamp():
    payload = body()
    timestamp = str(int(time.time()) - 600)
    res = send(payload, msg_id="msg_stale", timestamp=timestamp, signature=sign(payload, "msg_stale", timestamp))
    assert res.status_code == 401


def test_fails_closed_when_the_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("PRIVIDIUM_WEBHOOK_SECRET", raising=False)
    assert send(body()).status_code == 500


def test_fails_closed_when_the_secret_is_not_a_whsec_secret(monkeypatch):
    monkeypatch.setenv("PRIVIDIUM_WEBHOOK_SECRET", "not-a-whsec-secret")
    assert send(body()).status_code == 500
