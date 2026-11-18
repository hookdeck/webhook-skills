# Generated with: juniper-mist-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "mist_synthetic_webhook_secret_4b1e"
os.environ["MIST_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_mist_signature  # noqa: E402

client = TestClient(app)

BODY = '{"topic":"audits","events":[{"admin_name":"Synthetic Admin","id":"5f1e2d3c-0000-4000-8000-000000000001","message":"Update Site Settings","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","src_ip":"192.0.2.10","timestamp":1763460900.123}]}'
BODY2 = '{"topic":"device-events","events":[{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461200,"type":"AP_RESTARTED"},{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461260,"type":"AP_CONFIGURED"}]}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    return "" + hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_other_encoding(body, key=SECRET):
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return "" + base64.b64encode(digest).decode()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-Mist-Signature-v2"] = signature
    return client.post("/webhooks/juniper-mist", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MIST_WEBHOOK_SECRET", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_mist_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_mist_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_uppercase_hex_is_accepted():
    assert verify_mist_signature(BODY, sign(BODY).upper(), SECRET)


def test_v1_sha1_value_is_rejected_as_v2():
    v1 = hmac.new(SECRET.encode(), BODY.encode(), hashlib.sha1).hexdigest()
    assert not verify_mist_signature(BODY, v1, SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "topic": "audits", "events": 1}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data == {"received": True, "topic": "device-events", "events": 2}


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"Update Site Settings"', '"Delete Site"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_v1_header_alone_is_rejected():
    v1 = hmac.new(SECRET.encode(), BODY.encode(), hashlib.sha1).hexdigest()
    assert post(BODY, headers={"X-Mist-Signature": v1}).status_code == 401


def test_v2_alongside_v1_is_accepted():
    v1 = hmac.new(SECRET.encode(), BODY.encode(), hashlib.sha1).hexdigest()
    assert post(BODY, sign(BODY), headers={"X-Mist-Signature": v1}).status_code == 200


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MIST_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("MIST_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
