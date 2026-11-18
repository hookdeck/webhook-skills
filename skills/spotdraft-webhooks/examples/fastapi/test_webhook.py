# Generated with: spotdraft-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Synthetic hmac_key (base64 of 32 bytes), shaped like the one the API returns.
SECRET = "ZriLMkIFq6U9cm556D0HUEVn2hb3tZWHv5r/u7dgf2I="
KEY = base64.b64decode(SECRET)
OTHER_KEY = hashlib.sha256(b"another-spotdraft-workspace").digest()
BAD_SECRET = "not base64!"
SIGNATURE_HEADER = "x-sd-webhook-content-hash"

# Check vector: synthetic key and a fixed body (SpotDraft publishes none).
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_HASH = (
    "8a0bcf7b021c4420bc9892ba61e3bdd0790759d011db82857aacb7341a73e153"
    "01f1e7b55e66c20868031a8102aed0392111e98173ff4c56ca5f4d595c33d347"
)

# Made-up body: SpotDraft's guides don't publish a payload sample. Pretty-printed so a
# re-serialised body would not match.
BODY = json.dumps({"id": "evt_test_1", "activity": "CONTRACT_EXECUTED", "note": "illustrative"}, indent=2)
TAMPER_FROM = "CONTRACT_EXECUTED"
TAMPER_TO = "CONTRACT_CREATED"

os.environ["SPOTDRAFT_HMAC_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_spotdraft_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY, digestmod=hashlib.sha512):
    """Sign like SpotDraft: hex HMAC-SHA512 of the raw body, keyed with the decoded hmac_key."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    return {"x-sd-webhook-content-hash": hmac.new(key, raw, digestmod).hexdigest()}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/spotdraft", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SPOTDRAFT_HMAC_KEY", SECRET)


def test_check_vector():
    assert verify_spotdraft_webhook(VECTOR_BODY, VECTOR_HASH, SECRET)
    assert verify_spotdraft_webhook(VECTOR_BODY.encode(), VECTOR_HASH.upper(), SECRET)


def test_vector_fails_with_a_malformed_key_or_a_truncated_hash():
    assert not verify_spotdraft_webhook(VECTOR_BODY, VECTOR_HASH, BAD_SECRET)
    assert not verify_spotdraft_webhook(VECTOR_BODY, VECTOR_HASH[:64], SECRET)


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
    monkeypatch.setenv("SPOTDRAFT_HMAC_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("SPOTDRAFT_HMAC_KEY")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_base64_returns_500(monkeypatch):
    monkeypatch.setenv("SPOTDRAFT_HMAC_KEY", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_sha256_hash_in_place_of_sha512_is_rejected():
    assert post(BODY, sign(BODY, digestmod=hashlib.sha256)).status_code == 401
