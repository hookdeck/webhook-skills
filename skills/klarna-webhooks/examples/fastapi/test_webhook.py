# Generated with: klarna-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "klarna_synthetic_signing_key_8a4f2c"
os.environ["KLARNA_SIGNING_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_klarna_signature  # noqa: E402

client = TestClient(app)

BODY = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90001","event_type":"payment.request.state-change.completed","event_version":"v2","occurred_at":"2026-11-18T10:15:00.000Z","product_instance_id":"krn:partner:product:test:5cadd30a-0000-4000-8000-000000000001","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000001"}}'
BODY2 = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90002","event_type":"payment.request.state-change.expired","event_version":"v2","occurred_at":"2026-11-18T10:20:00.000Z","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000002"}}'


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
        all_headers["Klarna-Signature"] = signature
    return client.post("/webhooks/klarna", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("KLARNA_SIGNING_KEY", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_klarna_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_klarna_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "payment.request.state-change.completed", "event_id": "b0e715e0-2ebd-462f-80f6-1366b4f90001"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "payment.request.state-change.expired"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('state-change.completed', 'state-change.declined'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("KLARNA_SIGNING_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("KLARNA_SIGNING_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
