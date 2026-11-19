# Generated with: bitgo-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "bitgo_synthetic_webhook_secret_5e2d"
os.environ["BITGO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_bitgo_signature  # noqa: E402

client = TestClient(app)

BODY = '{"type":"transfer","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","transfer":"68531ea4e3669330070c95e454f5b366","hash":"db924f4cf2347ac5a6b464d3e8dc4a20cffc117eb29f4460645fbc34de171bfb","state":"confirmed","simulation":true}'
BODY2 = '{"type":"pendingapproval","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","pendingApprovalId":"6853262b9da229cea98569ce","state":"pending","simulation":true}'


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
        all_headers["X-Signature-SHA256"] = signature
    return client.post("/webhooks/bitgo", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("BITGO_WEBHOOK_SECRET", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_bitgo_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_bitgo_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "transfer", "wallet": "62c5b5c9d0ece30007cec9616ff29edc"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "pendingapproval"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"state":"confirmed"', '"state":"failed"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("BITGO_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("BITGO_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
