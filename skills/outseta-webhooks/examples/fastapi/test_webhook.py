# Generated with: outseta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Synthetic Webhook Signature Key: 32 bytes as hex, like the output of openssl rand -hex 32.
SECRET = "587f17dc2d218994867047c65133e38fc10c94f664fdc3c78370c49c0bf1a480"
KEY = bytes.fromhex(SECRET)
OTHER_KEY = hashlib.sha256(b"another-outseta-account").digest()
# The same 32 bytes written as base64: Outseta requires hex, so the handler refuses it.
BAD_SECRET = "WH8X3C0hiZSGcEfGUTPjj8EMlPZk/cPHg3DEnAvxpIA="
SIGNATURE_HEADER = "x-hub-signature-256"

# Check vector: synthetic key and a fixed body (Outseta publishes none).
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_SIGNATURE = "sha256=1ed97849266847e37b36371bba32e3d8013a5cd0a9abcd59c52441be43da18ba"

# Made-up Person record: Outseta's signature article doesn't show a payload. Pretty-printed
# so a re-serialised body would not match.
BODY = json.dumps({"Uid": "wZmNw7Q2", "Email": "ada@example.com", "FirstName": "Ada", "LastName": "Lovelace"}, indent=2)
TAMPER_FROM = "ada@example.com"
TAMPER_TO = "eve@example.com"

os.environ["OUTSETA_WEBHOOK_SIGNATURE_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_outseta_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY):
    """Sign like Outseta: sha256= + hex HMAC-SHA256 of the raw body, keyed with the hex-decoded key."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    return {"x-hub-signature-256": "sha256=" + hmac.new(key, raw, hashlib.sha256).hexdigest()}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/outseta", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("OUTSETA_WEBHOOK_SIGNATURE_KEY", SECRET)


def test_check_vector():
    assert verify_outseta_webhook(VECTOR_BODY, VECTOR_SIGNATURE, SECRET)
    assert verify_outseta_webhook(VECTOR_BODY.encode(), VECTOR_SIGNATURE, SECRET)


def test_vector_fails_with_a_key_that_is_not_hex():
    assert not verify_outseta_webhook(VECTOR_BODY, VECTOR_SIGNATURE, BAD_SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, key=OTHER_KEY)).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY, without(sign(BODY), SIGNATURE_HEADER)).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("OUTSETA_WEBHOOK_SIGNATURE_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("OUTSETA_WEBHOOK_SIGNATURE_KEY")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_hex_returns_500(monkeypatch):
    monkeypatch.setenv("OUTSETA_WEBHOOK_SIGNATURE_KEY", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_hex_key_decoded_as_base64_is_rejected():
    # A 64-character hex string is also valid base64: it decodes to 48 wrong bytes.
    assert post(BODY, sign(BODY, key=base64.b64decode(SECRET))).status_code == 401


def test_signature_without_sha256_prefix_is_rejected():
    bare = sign(BODY)[SIGNATURE_HEADER][len("sha256="):]
    assert post(BODY, {SIGNATURE_HEADER: bare}).status_code == 401
