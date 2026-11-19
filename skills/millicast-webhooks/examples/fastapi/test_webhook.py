# Generated with: millicast-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Synthetic Webhook Secret (base64 of 32 bytes), shaped like the one the dashboard shows.
SECRET = "10ipEMzmyDx7MyTJS7uQrbkyuvpL38y7mLV9Uv8uolg="
KEY = base64.b64decode(SECRET)
OTHER_KEY = hashlib.sha256(b"another-millicast-webhook").digest()
BAD_SECRET = "not base64!"
SIGNATURE_HEADER = "x-millicast-signature"

# Check vector: synthetic secret and a fixed JSON body (Millicast publishes none).
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_SIGNATURE = "sha1=b021d0d11fdbdb96f07e548a06461ada81c78152"

# A JPEG-shaped binary body (thumbnail hooks send the image itself). It isn't valid UTF-8.
JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]) + b"JFIF\0" + bytes(range(256)) + bytes([0xFF, 0xD9])
JPEG_SIGNATURE = "sha1=c2194e698535f850aaf0756f51569f6ba4b6818c"

# Feed started event in the documented envelope (IDs are made up), pretty-printed so a
# re-serialised body would not match.
BODY = json.dumps(
    {
        "type": "feeds",
        "event": "started",
        "timestamp": 1731924900123,
        "data": {
            "feedId": "feed-1",
            "accountId": "acct-1",
            "name": "demo-stream",
            "streamId": "acct-1/demo-stream",
            "started": 1731924900000,
            "active": True,
        },
    },
    indent=2,
)
TAMPER_FROM = "demo-stream"
TAMPER_TO = "other-stream"

os.environ["MILLICAST_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_millicast_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY):
    """Sign like Millicast: sha1= + hex HMAC-SHA1 of the raw body, keyed with the decoded secret."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    return {"x-millicast-signature": "sha1=" + hmac.new(key, raw, hashlib.sha1).hexdigest()}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/millicast", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MILLICAST_WEBHOOK_SECRET", SECRET)


def test_json_and_jpeg_check_vectors():
    assert verify_millicast_webhook(VECTOR_BODY, VECTOR_SIGNATURE, SECRET)
    assert verify_millicast_webhook(JPEG, JPEG_SIGNATURE, SECRET)


def test_binary_body_decoded_to_text_fails():
    lossy = JPEG.decode("utf-8", errors="replace").encode("utf-8")
    assert not verify_millicast_webhook(lossy, JPEG_SIGNATURE, SECRET)


def test_malformed_secret_fails():
    assert not verify_millicast_webhook(VECTOR_BODY, VECTOR_SIGNATURE, BAD_SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "feeds", "event": "started"}


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, key=OTHER_KEY)).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY, without(sign(BODY), SIGNATURE_HEADER)).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MILLICAST_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("MILLICAST_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_base64_returns_500(monkeypatch):
    monkeypatch.setenv("MILLICAST_WEBHOOK_SECRET", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_signed_jpeg_thumbnail_is_accepted():
    headers = {SIGNATURE_HEADER: JPEG_SIGNATURE, "x-millicast-stream-id": "acct-1/demo-stream"}
    res = post(JPEG, headers, content_type="image/jpeg")
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "thumbnail", "bytes": len(JPEG)}


def test_tampered_jpeg_thumbnail_is_rejected():
    tampered = bytearray(JPEG)
    tampered[20] ^= 0xFF
    assert post(bytes(tampered), {SIGNATURE_HEADER: JPEG_SIGNATURE}, content_type="image/jpeg").status_code == 401


def test_signature_without_sha1_prefix_is_rejected():
    bare = sign(BODY)[SIGNATURE_HEADER][len("sha1="):]
    assert post(BODY, {SIGNATURE_HEADER: bare}).status_code == 401
