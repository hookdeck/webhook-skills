# Generated with: fedex-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "SyntheticFedexToken2026abcdXYZ"
os.environ["FEDEX_WEBHOOK_SECURITY_TOKEN"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_fedex_signature  # noqa: E402

client = TestClient(app)

BODY = '{"trackingNumber":"794600000001","eventType":"IT","eventDescription":"In transit","synthetic":true}'
BODY2 = '{"trackingNumber":"794600000002","eventType":"DL","eventDescription":"Delivered","synthetic":true}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    digest = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    return "" + base64.b64encode(digest).decode()


def sign_other_encoding(body, key=SECRET):
    return "" + hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["fdx-signature"] = signature
    return client.post("/webhooks/fedex", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("FEDEX_WEBHOOK_SECURITY_TOKEN", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_fedex_signature(BODY, sign(BODY), SECRET)


def test_hex_digest_is_rejected():
    assert not verify_fedex_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data == {"received": True}


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"eventType":"IT"', '"eventType":"DL"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("FEDEX_WEBHOOK_SECURITY_TOKEN", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("FEDEX_WEBHOOK_SECURITY_TOKEN")
    assert post(BODY, sign(BODY)).status_code == 500
