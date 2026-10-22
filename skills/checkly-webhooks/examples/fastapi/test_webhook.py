import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

SECRET = "checkly_test_secret"


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("CHECKLY_WEBHOOK_SECRET", SECRET)


from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def payload(alert_type: str) -> bytes:
    return json.dumps({"alertType": alert_type, "checkName": "Homepage", "checkId": "a1b2c3"}).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post("/webhooks/checkly", content=body, headers=headers or {})


@pytest.mark.parametrize("alert_type", ["ALERT_FAILURE", "ALERT_RECOVERY", "ALERT_DEGRADED", "ALERT_SSL"])
def test_valid_signature(alert_type):
    body = payload(alert_type)
    res = post(body, {
        "content-type": "application/json",
        "x-checkly-signature": sign(body),
        "x-checkly-timestamp": "1700000000000",
    })
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type():
    body = payload("ALERT_FAILURE")
    res = post(body, {"content-type": "text/plain", "x-checkly-signature": sign(body)})
    assert res.status_code == 200


def test_signature_covers_exact_raw_bytes():
    body = b'{ "alertType":  "ALERT_FAILURE",\n "checkName": "Homepage", "checkId": "a1b2c3" }'
    res = post(body, {"x-checkly-signature": sign(body)})
    assert res.status_code == 200


def test_missing_signature():
    assert post(payload("ALERT_FAILURE")).status_code == 400


def test_wrong_signature():
    body = payload("ALERT_FAILURE")
    assert post(body, {"x-checkly-signature": sign(body, "wrong_secret")}).status_code == 400


def test_wrong_length_signature():
    assert post(payload("ALERT_FAILURE"), {"x-checkly-signature": "abc"}).status_code == 400


def test_tampered_body():
    signature = sign(payload("ALERT_FAILURE"))
    assert post(payload("ALERT_RECOVERY"), {"x-checkly-signature": signature}).status_code == 400


def test_no_secret_configured(monkeypatch):
    monkeypatch.delenv("CHECKLY_WEBHOOK_SECRET")
    body = payload("ALERT_FAILURE")
    assert post(body, {"x-checkly-signature": sign(body)}).status_code == 400


def test_signed_non_json_body():
    body = b"not json"
    assert post(body, {"x-checkly-signature": sign(body)}).status_code == 400
