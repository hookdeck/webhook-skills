# Generated with: referralhero-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

SECRET = "rh_test_webhook_secret_key_0123456789"
os.environ["REFERRALHERO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign exactly like ReferralHero: base64 (standard, padded) HMAC-SHA256 of the raw body."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def event(name: str, **extra) -> bytes:
    return json.dumps({"response": name, **extra}).encode()


def send(body: bytes, signature="auto", content_type="application/json", secret=SECRET):
    headers = {"Content-Type": content_type}
    sig = sign(body, secret) if signature == "auto" else signature
    if sig is not None:
        headers["X-ReferralHero-Signature"] = sig
    return client.post("/webhooks/referralhero", content=body, headers=headers)


@pytest.mark.parametrize(
    "name",
    [
        "new_registration",
        "subscriber_promoted",
        "subscriber_updated",
        "subscriber_fields_updated",
        "subscriber_deleted",
        "reward_unlocked",
        "reward_sent",
    ],
)
def test_valid_event_gets_blank_200(name):
    res = send(event(name, subscriber={"id": "sub_1"}))
    assert res.status_code == 200
    assert res.text == ""


def test_unknown_event_is_accepted():
    assert send(event("something_new")).status_code == 200


def test_verifies_exact_bytes_including_whitespace():
    assert send(b'{ "response" :  "new_registration" }\n').status_code == 200


def test_any_content_type_is_accepted():
    assert send(event("reward_sent"), content_type="text/plain").status_code == 200


def test_missing_signature_is_401():
    assert send(event("new_registration"), signature=None).status_code == 401


def test_empty_signature_is_401():
    assert send(event("new_registration"), signature="").status_code == 401


def test_tampered_body_is_401():
    body = event("new_registration")
    tampered = body.replace(b"new_registration", b"reward_sent")
    assert send(tampered, signature=sign(body)).status_code == 401


def test_wrong_secret_is_401():
    assert send(event("new_registration"), secret="another-secret").status_code == 401


def test_hex_digest_is_401():
    body = event("new_registration")
    hex_sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert send(body, signature=hex_sig).status_code == 401


def test_prefixed_signature_is_401():
    body = event("new_registration")
    assert send(body, signature=f"sha256={sign(body)}").status_code == 401


def test_non_canonical_base64_is_401():
    body = event("new_registration")
    good = sign(body)
    # The last base64 character before "=" carries 4 unused bits; flip one.
    variant = good[:42] + ALPHABET[ALPHABET.index(good[42]) ^ 1] + "="
    assert base64.b64decode(variant) == base64.b64decode(good)
    assert send(body, signature=variant).status_code == 401


def test_signed_non_json_body_is_400():
    assert send(b"not json").status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("REFERRALHERO_WEBHOOK_SECRET")
    assert send(event("new_registration")).status_code == 500
