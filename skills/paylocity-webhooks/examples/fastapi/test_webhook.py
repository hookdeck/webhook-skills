# Generated with: paylocity-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Synthetic secrets (base64 of 32 bytes), shaped like auth.hmac.key1.secret and key2.secret.
SECRET = "6VYxrTi35LV17axsZ+L9bs/+RNu6M6T3bd6GYrToMf4="
NEXT_SECRET = "iTkwcVdDt7tofILQTCR0G3Y3HulFNa8MqALLX9DRAYs="
KEY = base64.b64decode(SECRET)
NEXT_KEY = base64.b64decode(NEXT_SECRET)
KEY_ID = "1b2c3d4e-0000-4000-8000-000000000001"
NEXT_KEY_ID = "7e4a0000-0000-4000-8000-000000000002"
OTHER_KEY = hashlib.sha256(b"another-paylocity-subscription").digest()
BAD_SECRET = "not base64!"
SIGNATURE_HEADER = "x-pcty-signature"
TIMESTAMP = "1731924900"

# Check vector: both synthetic keys, fixed body and timestamp (Paylocity publishes none).
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_TIMESTAMP = "1700000000"
VECTOR_HEADER = (
    "keyId=1b2c3d4e-0000-4000-8000-000000000001:signature=15276c12468d7d297cd6722ad59db1328f0d1c5e074c4faa5d4bde8a3877eeff,"
    "keyId=7e4a0000-0000-4000-8000-000000000002:signature=f10b4cfed0480f20b0bef9557ffb8d1708ab2e22e59aa3aaf38ad06b63945f5d"
)

# Illustrative CloudEvents-style event, pretty-printed so a re-serialised body would not match.
BODY = json.dumps(
    {
        "id": "5b0e6a52-2f1d-4c8e-9a3b-7d4f1e2c6a90",
        "type": "employee.assignment.v1",
        "time": "2026-11-18T10:15:00Z",
        "data": {"companyId": "C1234", "assignmentId": "E5678"},
    },
    indent=2,
)
TAMPER_FROM = "E5678"
TAMPER_TO = "E5679"

os.environ["PAYLOCITY_HMAC_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_paylocity_webhook  # noqa: E402

client = TestClient(app)


def hex_hmac(key, timestamp, body):
    raw = body.encode("utf-8") if isinstance(body, str) else body
    return hmac.new(key, timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()


def sign(body, key=KEY, timestamp=TIMESTAMP):
    """Sign like Paylocity with one active key."""
    return {
        "x-pcty-signature": f"keyId={KEY_ID}:signature={hex_hmac(key, timestamp, body)}",
        "x-pcty-timestamp": timestamp,
    }


def sign_rotating(body, timestamp=TIMESTAMP):
    """Sign like Paylocity during rotation: one pair per active key."""
    pairs = [
        f"keyId={KEY_ID}:signature={hex_hmac(KEY, timestamp, body)}",
        f"keyId={NEXT_KEY_ID}:signature={hex_hmac(NEXT_KEY, timestamp, body)}",
    ]
    return {"x-pcty-signature": ",".join(pairs), "x-pcty-timestamp": timestamp}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/paylocity", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PAYLOCITY_HMAC_SECRET", SECRET)
    monkeypatch.delenv("PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def test_check_vector_with_either_rotation_key():
    assert verify_paylocity_webhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET)
    assert verify_paylocity_webhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, NEXT_SECRET)
    assert verify_paylocity_webhook(VECTOR_BODY.encode(), VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET)


def test_vector_fails_with_another_timestamp_or_a_malformed_secret():
    assert not verify_paylocity_webhook(VECTOR_BODY, VECTOR_HEADER, "1700000001", SECRET)
    assert not verify_paylocity_webhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, BAD_SECRET)


def test_age_check_applies_only_with_a_tolerance():
    args = (VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET)
    assert verify_paylocity_webhook(*args, tolerance_seconds=300, now=1700000299)
    assert not verify_paylocity_webhook(*args, tolerance_seconds=300, now=1700000301)
    assert verify_paylocity_webhook(*args, now=1800000000)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "employee.assignment.v1"}


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, key=OTHER_KEY)).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY, without(sign(BODY), SIGNATURE_HEADER)).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("PAYLOCITY_HMAC_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("PAYLOCITY_HMAC_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_base64_returns_500(monkeypatch):
    monkeypatch.setenv("PAYLOCITY_HMAC_SECRET", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_rotation_header_with_either_secret(monkeypatch):
    assert post(BODY, sign_rotating(BODY)).status_code == 200
    monkeypatch.setenv("PAYLOCITY_HMAC_SECRET", NEXT_SECRET)
    assert post(BODY, sign_rotating(BODY)).status_code == 200


def test_changed_timestamp_and_pair_without_key_id_are_rejected():
    assert post(BODY, {**sign(BODY), "x-pcty-timestamp": "1731924901"}).status_code == 401
    bare = sign(BODY)[SIGNATURE_HEADER].replace(f"keyId={KEY_ID}:signature=", "")
    assert post(BODY, {**sign(BODY), SIGNATURE_HEADER: bare}).status_code == 401


def test_timestamp_age_checked_only_when_tolerance_is_set(monkeypatch):
    assert post(BODY, sign(BODY)).status_code == 200
    monkeypatch.setenv("PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS", "300")
    assert post(BODY, sign(BODY)).status_code == 401
    assert post(BODY, sign(BODY, timestamp=str(int(time.time())))).status_code == 200
