# Generated with: makeplans-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "mp_synthetic_account_secret_9d2c"
os.environ["MAKEPLANS_ACCOUNT_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_makeplans_signature  # noqa: E402

client = TestClient(app)

BODY = '{"event":"booking.created","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000001","generated_at":"2026-11-18T10:15:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"booking","id":4401,"booking":{"id":4401,"state":"confirmed","booked_from":"2026-11-20T09:00:00+01:00","booked_to":"2026-11-20T10:00:00+01:00","service_id":12,"resource_id":34,"person_id":56}},"object":"booking","id":4401}'
BODY2 = '{"event":"person.updated","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000002","generated_at":"2026-11-18T10:20:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"person","id":56,"person":{"id":56,"name":"Test Person"}},"object":"person","id":56}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    return "sha256=" + hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_other_encoding(body, key=SECRET):
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-MakePlans-Signature"] = signature
    return client.post("/webhooks/makeplans", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MAKEPLANS_ACCOUNT_SECRET", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_makeplans_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_makeplans_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_signature_without_prefix_is_rejected():
    assert not verify_makeplans_signature(BODY, sign(BODY)[len("sha256="):], SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "booking.created", "event_id": "b7c1e2d3-0000-4000-8000-000000000001"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "person.updated"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"state":"confirmed"', '"state":"cancelled"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MAKEPLANS_ACCOUNT_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("MAKEPLANS_ACCOUNT_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
