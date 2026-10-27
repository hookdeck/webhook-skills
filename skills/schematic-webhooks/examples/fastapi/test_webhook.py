import hashlib
import hmac
import json
import os
import secrets
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "test_schematic_webhook_secret"
os.environ["SCHEMATIC_WEBHOOK_SECRET"] = SECRET

from main import app, verify_schematic_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Same algorithm as Schematic: hex HMAC-SHA256(secret, rawBody + "+" + timestamp)."""
    content = b"".join([body, b"+", timestamp.encode("latin-1")])
    return hmac.new(secret.encode(), content, hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


def event(action: str, **extra) -> bytes:
    payload = {
        "action": action,
        "account_id": "acct_test",
        "environment_id": "env_test",
        "event_id": "whe_" + secrets.token_hex(6),
        "object_type": "company",
        "body": {"id": "comp_123", "name": "Acme é"},
    }
    payload.update(extra)
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def signed(body: bytes, ts: str = None, secret: str = SECRET) -> dict:
    ts = ts or now()
    return {
        "X-Schematic-Webhook-Signature": sign(body, ts, secret),
        "X-Schematic-Webhook-Signature-Version": "v1",
        "X-Schematic-Webhook-Timestamp": ts,
    }


def post(body: bytes, headers: dict = None, content_type: str = "application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/schematic", content=body, headers=h)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SCHEMATIC_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS", raising=False)


@pytest.mark.parametrize(
    "action",
    [
        "company.created",
        "user.created",
        "plan.created",
        "flag.updated",
        "subscription.trial.ended",
        "entitlement.limit.reached",
        "credit.purchase.success",
        "auto.topup.success",
    ],
)
def test_accepts_valid_signature(action):
    body = event(action)
    res = post(body, signed(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_test_send_without_event_id():
    body = json.dumps({"action": "company.created", "body": {}}).encode()
    assert post(body, signed(body)).status_code == 200


def test_verifies_exact_bytes_for_any_content_type():
    body = event("company.updated")
    assert post(body, signed(body), "text/plain").status_code == 200


def test_verifies_multibyte_body():
    body = event("company.updated", body={"name": "日本語 ✓"})
    assert post(body, signed(body)).status_code == 200


def test_accepts_uppercase_hex():
    body = event("company.created")
    headers = signed(body)
    headers["X-Schematic-Webhook-Signature"] = headers["X-Schematic-Webhook-Signature"].upper()
    assert post(body, headers).status_code == 200


def test_accepts_old_timestamp_by_default():
    body = event("company.created")
    old = str(int(time.time()) - 86400)
    assert post(body, signed(body, old)).status_code == 200


def test_tolerance_is_opt_in(monkeypatch):
    monkeypatch.setenv("SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS", "300")
    body = event("company.created")
    old = str(int(time.time()) - 3600)
    assert post(body, signed(body, old)).status_code == 401
    assert post(body, signed(body)).status_code == 200


def test_rejects_tampered_body():
    body = event("company.created")
    headers = signed(body)
    assert post(body.replace(b"Acme", b"Evil"), headers).status_code == 401


def test_rejects_wrong_secret():
    body = event("company.created")
    assert post(body, signed(body, secret="other_secret")).status_code == 401


def test_rejects_timestamp_first_ordering():
    body = event("company.created")
    ts = now()
    wrong = hmac.new(SECRET.encode(), ts.encode() + b"+" + body, hashlib.sha256).hexdigest()
    headers = {"X-Schematic-Webhook-Signature": wrong, "X-Schematic-Webhook-Timestamp": ts}
    assert post(body, headers).status_code == 401


def test_rejects_different_timestamp_than_signed():
    body = event("company.created")
    headers = signed(body, "1700000000")
    headers["X-Schematic-Webhook-Timestamp"] = "1700000001"
    assert post(body, headers).status_code == 401


def test_rejects_missing_signature():
    body = event("company.created")
    headers = signed(body)
    del headers["X-Schematic-Webhook-Signature"]
    assert post(body, headers).status_code == 401


def test_rejects_missing_timestamp():
    body = event("company.created")
    headers = signed(body)
    del headers["X-Schematic-Webhook-Timestamp"]
    assert post(body, headers).status_code == 401


@pytest.mark.parametrize(
    "sig",
    ["abcd", "z" * 64, "sha256=" + "a" * 64, "a" * 66, "a" * 63 + "\n"],
)
def test_rejects_malformed_signature(sig):
    body = event("company.created")
    headers = signed(body)
    headers["X-Schematic-Webhook-Signature"] = sig
    assert post(body, headers).status_code == 401


def test_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("SCHEMATIC_WEBHOOK_SECRET")
    body = event("company.created")
    assert post(body, signed(body)).status_code == 500


def test_400_for_verified_non_json():
    body = b"not json"
    assert post(body, signed(body), "text/plain").status_code == 400


def test_timestamp_used_as_received_latin1():
    body = b"{}"
    ts = " 1700000000 "  # never trimmed
    sig = sign(body, ts)
    assert verify_schematic_signature(body, sig, ts, SECRET)[0] is True
    assert verify_schematic_signature(body, sig, ts.strip(), SECRET)[0] is False


def test_secret_is_utf8_text_not_hex():
    secret = "deadbeefdeadbeef"
    sig = sign(b"{}", "1", secret)
    assert verify_schematic_signature(b"{}", sig, "1", secret)[0] is True


def test_tolerance_function():
    ts = str(int(time.time()) - 1000)
    sig = sign(b"{}", ts)
    assert verify_schematic_signature(b"{}", sig, ts, SECRET, 0)[0] is True
    assert verify_schematic_signature(b"{}", sig, ts, SECRET, 60)[0] is False
