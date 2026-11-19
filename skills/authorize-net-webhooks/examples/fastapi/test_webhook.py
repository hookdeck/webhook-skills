# Generated with: authorize-net-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"
os.environ["AUTHORIZE_NET_SIGNATURE_KEY"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_authorize_net_signature  # noqa: E402

client = TestClient(app)

BODY = '{"notificationId":"9b3c7e10-5f2a-4c1d-8e6b-0a1b2c3d4e5f","eventType":"net.authorize.payment.authcapture.created","eventDate":"2026-11-18T10:15:00.0000000Z","webhookId":"5e6f7a8b-1c2d-4e3f-9a0b-c1d2e3f4a5b6","payload":{"responseCode":1,"merchantReferenceId":"SYNTH-ORDER-0001","authCode":"LZ6I19","avsResponse":"Y","authAmount":45.00,"entityName":"transaction","id":"60020981676"}}'
BODY2 = '{"notificationId":"1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9","eventType":"net.authorize.customer.created","eventDate":"2026-11-18T10:16:00.0000000Z","webhookId":"5e6f7a8b-1c2d-4e3f-9a0b-c1d2e3f4a5b6","payload":{"paymentProfiles":[{"id":"694","customerType":"individual"}],"merchantCustomerId":"cust457","entityName":"customerProfile","id":"394"}}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    return "sha512=" + hmac.new(key, body.encode("utf-8"), hashlib.sha512).hexdigest().upper()


def sign_other_encoding(body, key=SECRET):
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha512).digest()
    return "sha512=" + base64.b64encode(digest).decode()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-ANET-Signature"] = signature
    return client.post("/webhooks/authorize-net", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("AUTHORIZE_NET_SIGNATURE_KEY", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_authorize_net_signature(BODY, sign(BODY), SECRET)


def test_base64_digest_is_rejected():
    assert not verify_authorize_net_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_signature_without_prefix_is_rejected():
    assert not verify_authorize_net_signature(BODY, sign(BODY)[len("sha512="):], SECRET)


def test_hex_decoded_signature_key_is_rejected():
    digest = hmac.new(bytes.fromhex(SECRET), BODY.encode(), hashlib.sha512).hexdigest().upper()
    assert not verify_authorize_net_signature(BODY, "sha512=" + digest, SECRET)


def test_lowercase_hex_and_uppercase_prefix_are_accepted():
    digest = hmac.new(SECRET.encode(), BODY.encode(), hashlib.sha512).hexdigest()
    assert verify_authorize_net_signature(BODY, "sha512=" + digest, SECRET)
    assert verify_authorize_net_signature(BODY, "SHA512=" + digest.upper(), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "net.authorize.payment.authcapture.created", "event_id": "9b3c7e10-5f2a-4c1d-8e6b-0a1b2c3d4e5f"}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "net.authorize.customer.created"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"authAmount":45.00', '"authAmount":4500.00'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("AUTHORIZE_NET_SIGNATURE_KEY", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("AUTHORIZE_NET_SIGNATURE_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
