# Generated with: uphold-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Uphold's endpoint secret comes from the Svix-hosted Webhooks Portal:
# "whsec_" + base64(key bytes). The HMAC key is the base64-DECODED part.
SECRET = "whsec_" + base64.b64encode(b"uphold-test-signing-key-01234567").decode()

os.environ["UPHOLD_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Uphold/Svix."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    # Uphold sends Title-Case header names; HTTP headers are case-insensitive.
    msg_id = webhook_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "Content-Type": "application/json",
        "Webhook-Id": msg_id,
        "Webhook-Timestamp": ts,
        "Webhook-Signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/uphold", content=raw_body, headers=headers)


def event(event_type: str, data: dict) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "createdAt": "2025-02-20T21:21:09.943Z",
        "data": data,
    }


def transaction_status_changed(status="completed", status_details=None) -> dict:
    transaction = {
        "id": "623000c8-9bdf-4a2b-aa3d-6a6b44a7f6a0",
        "origin": {
            "amount": "100.00",
            "asset": "GBP",
            "rate": "47619.04761904762",
            "node": {
                "type": "account",
                "id": "b98e4f0d-a67d-4126-a99d-666f7e0315d9",
                "ownerId": "e4ce04dc-67b7-4e9f-af91-482cb6f9fc4a",
            },
        },
        "destination": {
            "amount": "0.0021",
            "asset": "BTC",
            "rate": "0.000021",
            "node": {
                "type": "account",
                "id": "555a99a1-620d-4431-a0ac-b43e1aad2bdc",
                "ownerId": "e4ce04dc-67b7-4e9f-af91-482cb6f9fc4a",
            },
        },
        "denomination": {"amount": "100.00", "asset": "GBP", "target": "origin", "rate": "1"},
        "fees": [],
        "status": status,
        "quotedAt": "2024-07-24T15:02:39.000Z",
        "createdAt": "2024-07-24T15:22:39.000Z",
        "updatedAt": "2024-07-24T15:32:39.000Z",
    }
    if status_details:
        transaction["statusDetails"] = status_details
    return event("core.transaction.status-changed", {"transaction": transaction})


def user_created() -> dict:
    return event(
        "core.user.created",
        {
            "user": {
                "id": "cd21b26d-35d2-408a-9201-b8fdbef7a604",
                "type": "individual",
                "email": "john.doe@uphold.com",
                "primaryCitizenship": "GB",
                "address": {"country": "GB", "subdivision": "GB-MAN"},
                "createdAt": "2024-03-13T20:20:39.000Z",
                "updatedAt": "2024-03-13T20:20:39.000Z",
            }
        },
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("UPHOLD_WEBHOOK_SECRET", SECRET)


# --- Valid signatures --------------------------------------------------------


def test_accepts_user_created(caplog):
    body = json.dumps(user_created())
    with caplog.at_level(logging.INFO, logger="uphold-webhooks"):
        res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "User created" in caplog.text


def test_accepts_transaction_completed(caplog):
    body = json.dumps(transaction_status_changed("completed"))
    with caplog.at_level(logging.INFO, logger="uphold-webhooks"):
        res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert "completed: 0.0021 BTC" in caplog.text


def test_accepts_transaction_failed_with_reason(caplog):
    body = json.dumps(
        transaction_status_changed("failed", {"reason": "bank-account-holder-name-mismatch"})
    )
    with caplog.at_level(logging.INFO, logger="uphold-webhooks"):
        res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert "reason=bank-account-holder-name-mismatch" in caplog.text


def test_accepts_account_balance_changed():
    body = json.dumps(
        event(
            "core.account.balance-changed",
            {
                "account": {
                    "id": "555a99a1-620d-4431-a0ac-b43e1aad2bdc",
                    "ownerId": "1e32fca3-23f7-40ed-bc1b-de10c790182d",
                    "label": "My BTC account",
                    "asset": "BTC",
                    "balance": {"total": "0.5", "available": "0.3"},
                    "createdAt": "2024-06-01T00:00:00.000Z",
                    "updatedAt": "2024-07-15T00:00:00.000Z",
                }
            },
        )
    )
    res = post(body, signed_headers(body))
    assert res.status_code == 200


def test_accepts_kyc_status_event(caplog):
    body = json.dumps(
        event(
            "core.kyc.identity.status-changed",
            {"status": "ok", "userId": "123e4567-e89b-12d3-a456-426614174000"},
        )
    )
    with caplog.at_level(logging.INFO, logger="uphold-webhooks"):
        res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert "core.kyc.identity.status-changed" in caplog.text


def test_acknowledges_unknown_event_types():
    body = json.dumps(event("core.something.new", {}))
    res = post(body, signed_headers(body))
    assert res.status_code == 200


def test_accepts_any_matching_signature_in_list():
    body = json.dumps(user_created())
    headers = signed_headers(body)
    headers["Webhook-Signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['Webhook-Signature']}"
    res = post(body, headers)
    assert res.status_code == 200


def test_duplicate_delivery_returns_200():
    body = json.dumps(user_created())
    first = post(body, signed_headers(body))
    second = post(body, signed_headers(body))
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


# --- Invalid requests --------------------------------------------------------


def test_rejects_missing_headers():
    body = json.dumps(user_created())
    res = post(body, {"Content-Type": "application/json"})
    assert res.status_code == 400


def test_rejects_svix_prefixed_headers():
    # Uphold sends webhook-* headers; the handler only reads those.
    body = json.dumps(user_created())
    h = signed_headers(body)
    res = post(
        body,
        {
            "Content-Type": "application/json",
            "svix-id": h["Webhook-Id"],
            "svix-timestamp": h["Webhook-Timestamp"],
            "svix-signature": h["Webhook-Signature"],
        },
    )
    assert res.status_code == 400


def test_rejects_bad_signature():
    body = json.dumps(user_created())
    res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
    assert res.status_code == 400


def test_rejects_malformed_signature_header():
    body = json.dumps(user_created())
    res = post(body, signed_headers(body, signature="not-a-signature"))
    assert res.status_code == 400


def test_rejects_different_secret():
    other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
    body = json.dumps(user_created())
    res = post(body, signed_headers(body, secret=other))
    assert res.status_code == 400


def test_rejects_tampered_body():
    body = json.dumps(transaction_status_changed("failed"))
    headers = signed_headers(body)
    res = post(body.replace('"failed"', '"completed"'), headers)
    assert res.status_code == 400


def test_rejects_stale_timestamp():
    body = json.dumps(user_created())
    res = post(body, signed_headers(body, timestamp=now() - 600))
    assert res.status_code == 400


def test_rejects_undecoded_secret_key():
    body = json.dumps(user_created())
    msg_id, ts = "msg_undecoded", str(now())
    wrong = base64.b64encode(
        hmac.new(
            SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
        ).digest()
    ).decode()
    res = post(body, signed_headers(body, webhook_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
    assert res.status_code == 400


# --- Fail closed -------------------------------------------------------------


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("UPHOLD_WEBHOOK_SECRET", raising=False)
    body = json.dumps(user_created())
    res = post(body, signed_headers(body))
    assert res.status_code == 500
