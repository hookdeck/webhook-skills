# Generated with: mindbody-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "c3ludGhldGljLW1pbmRib2R5LXNpZ25hdHVyZS1rZXk="
os.environ["MINDBODY_MESSAGE_SIGNATURE_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_mindbody_signature  # noqa: E402

client = TestClient(app)

BODY = '{"messageId":"SynthMsg00000000000001","eventId":"classRosterBooking.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:15:00Z","eventData":{"siteId":-99,"locationId":1,"classId":201,"classRosterBookingId":11,"classStartDateTime":"2026-11-20T12:00:00Z","classEndDateTime":"2026-11-20T13:00:00Z","clientId":"100000009"}}'
BODY2 = '{"messageId":"SynthMsg00000000000002","eventId":"client.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:20:00Z","eventData":{"siteId":-99,"clientId":"100000010","firstName":"Test","lastName":"Client"}}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    digest = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode()


def sign_other_encoding(body, key=SECRET):
    return "sha256=" + hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-Mindbody-Signature"] = signature
    return client.post("/webhooks/mindbody", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MINDBODY_MESSAGE_SIGNATURE_KEY", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_mindbody_signature(BODY, sign(BODY), SECRET)


def test_hex_digest_is_rejected():
    assert not verify_mindbody_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_signature_without_prefix_is_rejected():
    assert not verify_mindbody_signature(BODY, sign(BODY)[len("sha256="):], SECRET)


def test_key_is_used_as_text_not_base64_decoded():
    assert not verify_mindbody_signature(BODY, sign(BODY, base64.b64decode(SECRET)), SECRET)


def test_head_check_returns_200():
    assert client.head("/webhooks/mindbody").status_code == 200


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "classRosterBooking.created", "event_id": "SynthMsg00000000000001"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "client.created"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"classId":201', '"classId":202'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MINDBODY_MESSAGE_SIGNATURE_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("MINDBODY_MESSAGE_SIGNATURE_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
