# Generated with: employment-hero-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Synthetic secret key (base64 of 32 bytes), shaped like the one the Developer Portal shows.
SECRET = "s3y0VT/1knFo5q9JnXJCjQHyPt8GfhmYkcS8lNF3D/Q="
KEY = base64.b64decode(SECRET)
OTHER_KEY = hashlib.sha256(b"another-employment-hero-webhook").digest()
BAD_SECRET = "not base64!"
SIGNATURE_HEADER = "x-employmenthero-signature"
TIMESTAMP = "1731924900"

# Check vector: synthetic secret, fixed body and timestamp (Employment Hero publishes none).
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_TIMESTAMP = "1700000000"
VECTOR_SIGNATURE = "y/dPUVP8svSzwTMHHftIu7AnRoLSZxFwdD8iK1MWLEY="

# Made-up body: Employment Hero doesn't publish a payload sample. Pretty-printed so a
# re-serialised body would not match.
BODY = json.dumps({"id": "evt_test_1", "type": "test", "data": {"note": "illustrative"}}, indent=2)
TAMPER_FROM = "illustrative"
TAMPER_TO = "tampered"

os.environ["EMPLOYMENT_HERO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_employment_hero_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY, timestamp=TIMESTAMP):
    """Sign like Employment Hero: base64 HMAC-SHA256 of "<timestamp>.<body>", keyed with the decoded secret."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    digest = hmac.new(key, timestamp.encode() + b"." + raw, hashlib.sha256).digest()
    return {"x-employmenthero-signature": base64.b64encode(digest).decode(), "x-employmenthero-timestamp": timestamp}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/employment-hero", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("EMPLOYMENT_HERO_WEBHOOK_SECRET", SECRET)


def test_check_vector():
    assert verify_employment_hero_webhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)
    assert verify_employment_hero_webhook(VECTOR_BODY.encode(), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)


def test_vector_fails_with_another_timestamp_or_a_malformed_secret():
    assert not verify_employment_hero_webhook(VECTOR_BODY, VECTOR_SIGNATURE, "1700000001", SECRET)
    assert not verify_employment_hero_webhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, BAD_SECRET)


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
    monkeypatch.setenv("EMPLOYMENT_HERO_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("EMPLOYMENT_HERO_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_base64_returns_500(monkeypatch):
    monkeypatch.setenv("EMPLOYMENT_HERO_WEBHOOK_SECRET", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_changed_or_missing_timestamp_is_rejected():
    assert post(BODY, {**sign(BODY), "x-employmenthero-timestamp": "1731924901"}).status_code == 401
    assert post(BODY, without(sign(BODY), "x-employmenthero-timestamp")).status_code == 401


def test_hex_digest_in_place_of_base64_is_rejected():
    hex_digest = hmac.new(KEY, TIMESTAMP.encode() + b"." + BODY.encode(), hashlib.sha256).hexdigest()
    assert post(BODY, {**sign(BODY), SIGNATURE_HEADER: hex_digest}).status_code == 401
