# Generated with: marqeta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic credentials
USERNAME = "marqeta_webhook"
PASSWORD = "Synthetic_Pass-2026:abcXYZ!"
SECRET = "Synthetic_Secret-2026_abcXYZ#"
os.environ["MARQETA_WEBHOOK_USERNAME"] = USERNAME
os.environ["MARQETA_WEBHOOK_PASSWORD"] = PASSWORD

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_algorithms, verify_basic_auth, verify_marqeta_signature  # noqa: E402

client = TestClient(app)

TXNS = '{"transactions":[{"type":"authorization","state":"PENDING","token":"synthetic-txn-0001","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:15:00Z"},{"type":"authorization.clearing","state":"COMPLETION","token":"synthetic-txn-0002","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:16:00Z"}]}'
CARD = '{"cards":[{"token":"synthetic-cardtransition-01","card_token":"synthetic-card-01","user_token":"synthetic-user-01","state":"ACTIVE","type":"state.activated","channel":"API","created_time":"2026-11-18T10:17:00Z"}]}'
PING = '{"pings":[{"token":"marqeta","payload":"healthcheck"}]}'


def basic(username=USERNAME, password=PASSWORD):
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def sign(body, algorithm="sha256", key=SECRET):
    return hmac.new(key.encode(), body.encode(), getattr(hashlib, algorithm)).hexdigest()


def post(body, authorization=None, signature=None):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    if signature is not None:
        headers["X-Marqeta-Signature"] = signature
    return client.post("/webhooks/marqeta", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MARQETA_WEBHOOK_USERNAME", USERNAME)
    monkeypatch.setenv("MARQETA_WEBHOOK_PASSWORD", PASSWORD)
    monkeypatch.delenv("MARQETA_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("MARQETA_SIGNATURE_ALGORITHM", raising=False)


def test_basic_auth_with_colon_in_password():
    assert verify_basic_auth(basic(), USERNAME, PASSWORD)
    assert verify_basic_auth(basic().replace("Basic", "basic"), USERNAME, PASSWORD)


def test_other_schemes_and_malformed_credentials_are_rejected():
    assert not verify_basic_auth(f"Bearer {PASSWORD}", USERNAME, PASSWORD)
    assert not verify_basic_auth("Basic " + base64.b64encode(b"no-colon").decode(), USERNAME, PASSWORD)
    assert not verify_basic_auth("Basic !!!", USERNAME, PASSWORD)


def test_hmac_sha256_signature():
    assert verify_marqeta_signature(TXNS, sign(TXNS), SECRET)


def test_hmac_sha1_only_when_configured():
    assert verify_marqeta_signature(TXNS, sign(TXNS, "sha1"), SECRET, ["sha1"])
    assert not verify_marqeta_signature(TXNS, sign(TXNS, "sha1"), SECRET, ["sha256"])
    assert verify_marqeta_signature(TXNS, sign(TXNS, "sha1"), SECRET, parse_algorithms("sha256,sha1"))


def test_base64_other_secret_and_changed_body_are_rejected():
    b64 = base64.b64encode(hmac.new(SECRET.encode(), TXNS.encode(), hashlib.sha256).digest()).decode()
    assert not verify_marqeta_signature(TXNS, b64, SECRET)
    assert not verify_marqeta_signature(TXNS, sign(TXNS, key="Another_Secret-2026_xyz"), SECRET)
    assert not verify_marqeta_signature(TXNS.replace("10.00", "1000.00"), sign(TXNS), SECRET)


def test_valid_credentials_count_notifications():
    res = post(TXNS, basic())
    assert res.status_code == 200
    assert res.json() == {"received": True, "counts": {"transactions": 2}}


def test_other_notification_types():
    assert post(CARD, basic()).json()["counts"] == {"cards": 1}


def test_ping():
    res = post(PING, basic())
    assert res.status_code == 200
    assert res.json() == {"received": True, "ping": True}


def test_wrong_or_missing_credentials_are_rejected():
    assert post(TXNS, basic(USERNAME, "Wrong_Pass-2026_abcXYZ!")).status_code == 401
    assert post(TXNS, basic("someone-else", PASSWORD)).status_code == 401
    assert post(TXNS).status_code == 401


def test_signature_checked_when_secret_is_set(monkeypatch):
    monkeypatch.setenv("MARQETA_WEBHOOK_SECRET", SECRET)
    assert post(TXNS, basic(), sign(TXNS)).status_code == 200
    assert post(TXNS, basic()).status_code == 401
    assert post(TXNS.replace("10.00", "1000.00"), basic(), sign(TXNS)).status_code == 401
    assert post(TXNS, None, sign(TXNS)).status_code == 401


def test_legacy_sha1_during_switch(monkeypatch):
    monkeypatch.setenv("MARQETA_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("MARQETA_SIGNATURE_ALGORITHM", "sha256,sha1")
    assert post(TXNS, basic(), sign(TXNS, "sha1")).status_code == 200


def test_invalid_json_with_valid_credentials():
    assert post('{"truncated": ', basic()).status_code == 400


def test_fails_closed_without_credentials(monkeypatch):
    monkeypatch.delenv("MARQETA_WEBHOOK_PASSWORD")
    assert post(TXNS, basic()).status_code == 500
