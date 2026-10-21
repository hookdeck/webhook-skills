import base64
import hashlib
import hmac
import json
import os
import secrets
import time

import pytest

# OpenMeter auto-generated secrets are 'whsec_' + base64(32 random bytes)
TEST_SECRET = "whsec_" + base64.b64encode(b"openmeter_test_signing_secret_32").decode()
os.environ["OPENMETER_WEBHOOK_SECRET"] = TEST_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

EVENT_ID = "01J5WQFP993XTYM1HAZH3SHP2G"

ENTITLEMENT_DATA = {
    "entitlement": {"id": "01J5WM25BAXSCBKG2D9NDYJB6S", "featureKey": "llm_tokens", "type": "metered"},
    "feature": {"id": "01J5WKAM9FJ4621ARR641JS17Q", "key": "llm_tokens", "meterSlug": "tokens_total"},
    "subject": {"id": "01J5WM256DNGXKG2N17AHVXKTD", "key": "customer-1"},
    "threshold": {"type": "PERCENT", "value": 80},
    "value": {"balance": 254, "hasAccess": True, "overage": 0, "usage": 2369},
}

INVOICE_DATA = {"id": "01JSJ8XJ7Y0F1Q2W3E4R5T6Y7U", "number": "INV-2025-0042", "status": "draft"}


def sign(payload: str, secret: str, msg_id: str, timestamp: str) -> str:
    """Sign exactly as OpenMeter/Svix does:
    base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))"""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def signed_headers(payload: str, secret: str = TEST_SECRET, timestamp: int | None = None) -> dict:
    msg_id = "msg_" + secrets.token_hex(12)
    ts = str(timestamp if timestamp is not None else int(time.time()))
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": sign(payload, secret, msg_id, ts),
    }


def make_event(event_type: str, data: dict) -> str:
    return json.dumps(
        {"id": EVENT_ID, "timestamp": "2024-08-22T09:43:03.209883Z", "type": event_type, "data": data}
    )


def post(payload: str, headers: dict):
    return client.post("/webhooks/openmeter", content=payload, headers=headers)


@pytest.mark.parametrize(
    "event_type,data",
    [
        ("entitlements.balance.threshold", ENTITLEMENT_DATA),
        ("entitlements.reset", ENTITLEMENT_DATA),
        ("invoice.created", INVOICE_DATA),
        ("invoice.updated", INVOICE_DATA),
    ],
)
def test_accepts_valid_event(event_type, data):
    payload = make_event(event_type, data)
    res = post(payload, signed_headers(payload))
    assert res.status_code == 200
    assert res.json() == {"received": True, "id": EVENT_ID, "type": event_type}


def test_accepts_valid_signature_among_several():
    payload = make_event("invoice.created", INVOICE_DATA)
    headers = signed_headers(payload)
    bogus = "v1," + base64.b64encode(b"not-the-signature").decode()
    headers["svix-signature"] = f"{bogus} {headers['svix-signature']}"
    assert post(payload, headers).status_code == 200


def test_rejects_invalid_signature():
    payload = make_event("entitlements.reset", ENTITLEMENT_DATA)
    headers = signed_headers(payload)
    headers["svix-signature"] = "v1," + base64.b64encode(b"invalid").decode()
    assert post(payload, headers).status_code == 400


def test_rejects_wrong_secret():
    payload = make_event("entitlements.reset", ENTITLEMENT_DATA)
    wrong = "whsec_" + base64.b64encode(b"some_other_secret_value_32_bytes").decode()
    assert post(payload, signed_headers(payload, secret=wrong)).status_code == 400


def test_rejects_tampered_body():
    payload = make_event("invoice.updated", INVOICE_DATA)
    headers = signed_headers(payload)
    assert post(payload.replace("draft", "paid"), headers).status_code == 400


def test_rejects_stale_timestamp():
    payload = make_event("invoice.created", INVOICE_DATA)
    headers = signed_headers(payload, timestamp=int(time.time()) - 600)
    assert post(payload, headers).status_code == 400


def test_rejects_missing_headers():
    payload = make_event("invoice.created", INVOICE_DATA)
    res = post(payload, {"content-type": "application/json"})
    assert res.status_code == 400


def test_custom_secret_without_prefix_is_base64_decoded(monkeypatch):
    raw = base64.b64encode(b"openmeter_test_signing_secret_32").decode()
    monkeypatch.setenv("OPENMETER_WEBHOOK_SECRET", raw)
    payload = make_event("invoice.created", INVOICE_DATA)
    assert post(payload, signed_headers(payload)).status_code == 200


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("OPENMETER_WEBHOOK_SECRET")
    payload = make_event("invoice.created", INVOICE_DATA)
    assert post(payload, signed_headers(payload)).status_code == 500


def test_health():
    assert client.get("/health").status_code == 200
