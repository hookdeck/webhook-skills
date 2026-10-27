import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "lodgix_test_secret"

# Illustrative payload: Lodgix does not document the body shape
BODY = json.dumps({"message": {"id": "msg_123", "text": "Is early check-in possible?"}}).encode()


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("LODGIX_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("LODGIX_WEBHOOK_TOLERANCE_SECONDS", raising=False)


from main import app, verify_lodgix_signature  # noqa: E402

client = TestClient(app)


def sign(raw: bytes, timestamp: str, secret: str = SECRET) -> str:
    message = timestamp.encode("latin-1") + b"." + raw
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


def send(raw=BODY, timestamp=None, signature=None, event="message.received", content_type="application/json"):
    """timestamp/signature: None = default valid value, False = omit header."""
    ts = now() if timestamp is None else timestamp
    headers = {"content-type": content_type, "x-lodgix-event": event, "x-lodgix-delivery": "dlv_1"}
    if timestamp is not False:
        headers["x-lodgix-timestamp"] = ts
    if signature is None:
        headers["x-lodgix-signature"] = f"sha256={sign(raw, ts if ts is not False else '')}"
    elif signature is not False:
        headers["x-lodgix-signature"] = signature
    return client.post("/webhooks/lodgix", content=raw, headers=headers)


def test_valid_prefixed_signature():
    res = send()
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_bare_digest_accepted():
    ts = now()
    assert send(timestamp=ts, signature=sign(BODY, ts)).status_code == 200


def test_uppercase_hex_accepted():
    ts = now()
    assert send(timestamp=ts, signature=f"sha256={sign(BODY, ts).upper()}").status_code == 200


def test_any_content_type_accepted():
    assert send(content_type="text/plain").status_code == 200


def test_unknown_event_returns_200():
    assert send(event="reservation.created").status_code == 200


def test_wrong_secret_rejected():
    ts = now()
    assert send(timestamp=ts, signature=f"sha256={sign(BODY, ts, 'other')}").status_code == 401


def test_tampered_body_rejected():
    ts = now()
    sig = f"sha256={sign(BODY, ts)}"
    assert send(raw=BODY + b" ", timestamp=ts, signature=sig).status_code == 401


def test_changed_timestamp_rejected():
    sig = f"sha256={sign(BODY, '1700000000')}"
    assert send(timestamp="1700000001", signature=sig).status_code == 401


def test_missing_signature_rejected():
    assert send(signature=False).status_code == 401


def test_missing_timestamp_rejected():
    assert send(timestamp=False, signature=f"sha256={sign(BODY, '1')}").status_code == 401


def test_empty_signature_rejected():
    assert send(signature="").status_code == 401


@pytest.mark.parametrize("signature", ["sha256=zz", "sha256=" + "g" * 64, "sha256=" + "a" * 63, "sha256=" + "a" * 65])
def test_malformed_signature_rejected(signature):
    assert send(signature=signature).status_code == 401


def test_invalid_json_with_valid_signature_returns_400():
    assert send(raw=b"not json").status_code == 400


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("LODGIX_WEBHOOK_SECRET")
    assert send().status_code == 500


def test_old_timestamp_allowed_by_default():
    assert send(timestamp="1700000000").status_code == 200


def test_old_timestamp_rejected_when_tolerance_enabled(monkeypatch):
    monkeypatch.setenv("LODGIX_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert send(timestamp="1700000000").status_code == 401


def test_fresh_timestamp_accepted_when_tolerance_enabled(monkeypatch):
    monkeypatch.setenv("LODGIX_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert send().status_code == 200


def test_non_utf8_body_bytes_verified_exactly():
    raw = bytes([0x7B, 0xFF, 0xFE, 0x7D])
    ts = "1700000000"
    assert verify_lodgix_signature(raw, ts, f"sha256={sign(raw, ts)}", SECRET) is None
