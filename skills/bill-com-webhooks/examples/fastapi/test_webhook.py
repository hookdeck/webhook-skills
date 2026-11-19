# Generated with: bill-com-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Synthetic secret
SECRET = "bill_synthetic_security_key_7f3a9c"
os.environ["BILL_WEBHOOK_SECURITY_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_bill_signature  # noqa: E402

client = TestClient(app)

BODY = '{"metadata":{"eventId":"963507c4-8e6b-48f0-ae72-ea9c93710001","subscriptionId":"f6d06930-e3e2-4509-be37-4dbda29e0001","organizationId":"00802SYNTHETICORG001","eventType":"test","version":"1"},"payload":{"createdDate":"2026-11-18T10:15:27.127+00:00"}}'
BODY2 = '{"metadata":{"eventId":"963507c4-8e6b-48f0-ae72-ea9c93710002","subscriptionId":"f6d06930-e3e2-4509-be37-4dbda29e0001","organizationId":"00802SYNTHETICORG001","eventType":"bill.created","version":"1"},"payload":{"createdDate":"2026-11-18T10:20:00.000+00:00"}}'


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
        all_headers["X-Bill-Sha-Signature"] = signature
    return client.post("/webhooks/bill-com", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("BILL_WEBHOOK_SECURITY_KEY", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_bill_signature(BODY, sign(BODY), SECRET)


def test_hex_digest_is_rejected():
    assert not verify_bill_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_pretty_printed_body_does_not_verify():
    pretty = json.dumps(json.loads(BODY), indent=2)
    assert not verify_bill_signature(pretty, sign(BODY), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "test", "event_id": "963507c4-8e6b-48f0-ae72-ea9c93710001"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "bill.created"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"eventType":"test"', '"eventType":"bill.created"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("BILL_WEBHOOK_SECURITY_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("BILL_WEBHOOK_SECURITY_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
