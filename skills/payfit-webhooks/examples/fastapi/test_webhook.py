# Generated with: payfit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os
import time

import pytest

SECRET = "whsec_D0GCbp+5KpS3D+Br/8bijPSMm7LkLj1m"  # synthetic
os.environ["PAYFIT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_payfit_webhook  # noqa: E402

client = TestClient(app)

BODY = '{"type":"payroll.run","data":{"companyId":"602e441f3e724b4d74a9cc87","effectiveDate":"2026-11-18T13:02:33+00:00","payrollMonth":"202611"}}'
ACTIVATED = '{"type":"integration.activated","data":{"companyId":"602e441f3e724b4d74a9cc87","effectiveDate":"2026-11-18T09:20:39+00:00"}}'
KEY = base64.b64decode(SECRET[len("whsec_"):])


def sign(body, key=KEY, msg_id="msg_2pT9xY4bW8cN1qR3", timestamp=None):
    timestamp = timestamp or str(int(time.time()))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": "v1," + base64.b64encode(digest).decode()}


def post(body, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    return client.post("/webhooks/payfit", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PAYFIT_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("PAYFIT_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_svix_manual_verification_example():
    headers = {
        "svix-id": "msg_loFOjxBNrRLzqYUf",
        "svix-timestamp": "1731705121",
        "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
    }
    payload = '{"event_type":"ping","data":{"success":true}}'
    assert verify_payfit_webhook(payload, headers, "whsec_plJ3nmyCDGBKInavdOK15jsl")


def test_any_matching_v1_entry_passes_during_rotation():
    headers = sign(BODY)
    headers["svix-signature"] = "v1," + base64.b64encode(os.urandom(32)).decode() + " " + headers["svix-signature"]
    assert verify_payfit_webhook(BODY, headers, SECRET)


def test_timestamp_window_applies_only_when_set():
    old = sign(BODY, timestamp=str(int(time.time()) - 3600))
    assert verify_payfit_webhook(BODY, old, SECRET)
    assert not verify_payfit_webhook(BODY, old, SECRET, tolerance_seconds=300)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "payroll.run", "company_id": "602e441f3e724b4d74a9cc87"}


def test_integration_event_is_handled():
    res = post(ACTIVATED, sign(ACTIVATED))
    assert res.status_code == 200
    assert res.json()["type"] == "integration.activated"


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_secret_without_prefix_is_accepted(monkeypatch):
    monkeypatch.setenv("PAYFIT_WEBHOOK_SECRET", SECRET[len("whsec_"):])
    assert post(BODY, sign(BODY)).status_code == 200


def test_other_secret_and_tampered_body_are_rejected():
    assert post(BODY, sign(BODY, key=os.urandom(24))).status_code == 401
    assert post(BODY.replace("202611", "202612"), sign(BODY)).status_code == 401


def test_missing_svix_headers_are_rejected():
    for name in ("svix-id", "svix-timestamp", "svix-signature"):
        headers = sign(BODY)
        del headers[name]
        assert post(BODY, headers).status_code == 401


def test_old_timestamp_rejected_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("PAYFIT_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert post(BODY, sign(BODY, timestamp=str(int(time.time()) - 3600))).status_code == 401


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_missing_or_invalid_secret_returns_500(monkeypatch):
    monkeypatch.delenv("PAYFIT_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
    monkeypatch.setenv("PAYFIT_WEBHOOK_SECRET", "whsec_not*base64!")
    assert post(BODY, sign(BODY)).status_code == 500
