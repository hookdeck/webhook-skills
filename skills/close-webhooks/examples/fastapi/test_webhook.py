# Generated with: close-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Close's documented sample signature_key (hex, 32 bytes). Not a real credential.
SECRET = "058bfb6a3d8cfdc4da7c3be5901b16ae11da982b46a25fb2cd7016e97a140a1c"
KEY = bytes.fromhex(SECRET)
OTHER_KEY = hashlib.sha256(b"another-close-subscription").digest()
# The same 32 bytes written as base64: not what Close returns, so the handler refuses it.
BAD_SECRET = "BYv7aj2M/cTafDvlkBsWrhHamCtGol+yzXAW6XoUChw="
SIGNATURE_HEADER = "close-sig-hash"
TIMESTAMP = "1731924900"

# Check vector: Close's sample key and timestamp with a fixed body. (Close's sample hash
# can't be reproduced: the docs don't show the payload it was computed over.)
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_TIMESTAMP = "1544271440"
VECTOR_HASH = "80aef193499f656f34626d9beb748f6eeddd96f6af433706d201746f83fe6ba4"

# Illustrative lead.created event (IDs made up), pretty-printed so a re-serialised body would not match.
BODY = json.dumps(
    {
        "subscription_id": "whsub_test0001",
        "event": {
            "id": "ev_test0001",
            "object_type": "lead",
            "action": "created",
            "object_id": "lead_test0001",
            "lead_id": "lead_test0001",
            "organization_id": "orga_test0001",
            "changed_fields": [],
            "data": {"id": "lead_test0001", "display_name": "Acme Corp"},
            "previous_data": {},
        },
    },
    indent=2,
)
TAMPER_FROM = "Acme Corp"
TAMPER_TO = "Acme Inc"

os.environ["CLOSE_WEBHOOK_SIGNATURE_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_close_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY, timestamp=TIMESTAMP, delimiter=""):
    """Sign like Close: hex HMAC-SHA256 of timestamp + body (no delimiter), keyed with the hex-decoded key."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    digest = hmac.new(key, (timestamp + delimiter).encode() + raw, hashlib.sha256).hexdigest()
    return {"close-sig-hash": digest, "close-sig-timestamp": timestamp}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/close", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CLOSE_WEBHOOK_SIGNATURE_KEY", SECRET)


def test_check_vector_built_from_the_sample_key():
    assert verify_close_webhook(VECTOR_BODY, VECTOR_HASH, VECTOR_TIMESTAMP, SECRET)
    assert verify_close_webhook(VECTOR_BODY.encode(), VECTOR_HASH, VECTOR_TIMESTAMP, SECRET)


def test_vector_fails_with_another_timestamp_or_a_key_that_is_not_hex():
    assert not verify_close_webhook(VECTOR_BODY, VECTOR_HASH, "1544271441", SECRET)
    assert not verify_close_webhook(VECTOR_BODY, VECTOR_HASH, VECTOR_TIMESTAMP, BAD_SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event": "lead.created"}


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, key=OTHER_KEY)).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY, without(sign(BODY), SIGNATURE_HEADER)).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("CLOSE_WEBHOOK_SIGNATURE_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("CLOSE_WEBHOOK_SIGNATURE_KEY")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_hex_returns_500(monkeypatch):
    monkeypatch.setenv("CLOSE_WEBHOOK_SIGNATURE_KEY", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_hex_key_decoded_as_base64_is_rejected():
    # A 64-character hex string is also valid base64: it decodes to 48 wrong bytes.
    assert post(BODY, sign(BODY, key=base64.b64decode(SECRET))).status_code == 401


def test_dot_delimiter_is_rejected():
    assert post(BODY, sign(BODY, delimiter=".")).status_code == 401


def test_changed_or_missing_timestamp_is_rejected():
    assert post(BODY, {**sign(BODY), "close-sig-timestamp": "1731924901"}).status_code == 401
    assert post(BODY, without(sign(BODY), "close-sig-timestamp")).status_code == 401
