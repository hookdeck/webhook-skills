import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "paynow_test_signing_secret"
os.environ["PAYNOW_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str | None = None, secret: str = SECRET) -> dict:
    """Same algorithm as PayNow: base64(HMAC-SHA256(secret, f"{timestamp}.{body}"))."""
    timestamp = timestamp or str(int(time.time() * 1000))
    message = b"".join([timestamp.encode("latin-1"), b".", body])
    digest = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    return {"PayNow-Timestamp": timestamp, "PayNow-Signature": base64.b64encode(digest).decode()}


def event(event_type: str, body: dict | None = None) -> bytes:
    return json.dumps(
        {"event_id": "411486491630370817", "event_type": event_type, "body": body or {"id": "411486491630370816"}},
        ensure_ascii=False,
    ).encode()


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/paynow-gg", content=body, headers={"Content-Type": content_type, **(headers or {})}
    )


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("PAYNOW_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("PAYNOW_WEBHOOK_TOLERANCE_SECONDS", raising=False)


@pytest.mark.parametrize(
    "event_type", ["ON_ORDER_COMPLETED", "ON_PAYMENT_COMPLETED", "ON_REFUND", "ON_SUBSCRIPTION_RENEWED"]
)
def test_accepts_valid_signature(event_type):
    body = event(event_type)
    response = post(body, sign(body))
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_accepts_unknown_event_type():
    body = event("ON_SOMETHING_NEW")
    assert post(body, sign(body)).status_code == 200


def test_verifies_exact_bytes_for_any_content_type():
    body = event("ON_ORDER_COMPLETED", {"id": "1", "billing_name": "José"})
    assert post(body, sign(body), "text/plain").status_code == 200


def test_rejects_non_json_body_after_verifying_it():
    bad = bytes([0xFF, 0xFE, 0x7B])
    assert post(bad, sign(bad, "1700000000000"), "application/octet-stream").status_code == 400


def test_rejects_tampered_body():
    body = event("ON_ORDER_COMPLETED")
    assert post(body.replace(b"411486491630370816", b"1"), sign(body)).status_code == 401


def test_rejects_wrong_secret():
    body = event("ON_ORDER_COMPLETED")
    assert post(body, sign(body, secret="other_secret")).status_code == 401


def test_rejects_timestamp_that_was_not_signed():
    body = event("ON_ORDER_COMPLETED")
    headers = {**sign(body, "1700000000000"), "PayNow-Timestamp": "1700000000001"}
    assert post(body, headers).status_code == 401


def test_rejects_missing_signature_header():
    body = event("ON_ORDER_COMPLETED")
    assert post(body, {"PayNow-Timestamp": str(int(time.time() * 1000))}).status_code == 401


def test_rejects_missing_timestamp_header():
    body = event("ON_ORDER_COMPLETED")
    assert post(body, {"PayNow-Signature": sign(body)["PayNow-Signature"]}).status_code == 401


def test_rejects_request_with_no_headers():
    assert post(event("ON_ORDER_COMPLETED")).status_code == 401


@pytest.mark.parametrize(
    "bad_signature",
    [
        "abc=",
        hashlib.sha256(b"x").hexdigest()[:44],
        "A" * 42 + "-=",
        "A" * 44,
    ],
)
def test_rejects_malformed_signature(bad_signature):
    body = event("ON_ORDER_COMPLETED")
    assert post(body, {**sign(body), "PayNow-Signature": bad_signature}).status_code == 401


def test_rejects_signature_with_different_base64_case():
    body = event("ON_ORDER_COMPLETED")
    headers = sign(body)
    headers["PayNow-Signature"] = headers["PayNow-Signature"].lower()
    assert post(body, headers).status_code == 401


def test_rejects_non_canonical_base64():
    body = event("ON_ORDER_COMPLETED")
    headers = sign(body)
    sig = headers["PayNow-Signature"]
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    # Set a stray low bit in the last character: decodes to the same bytes, but is not what PayNow sends
    headers["PayNow-Signature"] = sig[:42] + alphabet[alphabet.index(sig[42]) | 1] + "="
    assert post(body, headers).status_code == 401


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("PAYNOW_WEBHOOK_SECRET")
    body = event("ON_ORDER_COMPLETED")
    assert post(body, sign(body)).status_code == 500


class TestTimestampTolerance:
    old = str(int(time.time() * 1000) - 60 * 60 * 1000)

    def test_old_timestamps_accepted_by_default(self):
        body = event("ON_ORDER_COMPLETED")
        assert post(body, sign(body, self.old)).status_code == 200

    def test_old_timestamps_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("PAYNOW_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("ON_ORDER_COMPLETED")
        assert post(body, sign(body, self.old)).status_code == 401

    def test_fresh_timestamps_accepted_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("PAYNOW_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("ON_ORDER_COMPLETED")
        assert post(body, sign(body)).status_code == 200
