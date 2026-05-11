import hashlib
import hmac
import json
import os
import secrets
import time

import pytest
from httpx import ASGITransport, AsyncClient

SIGNING_KEY = "test-signing-key"
PARENT_KEY = "parent-account-signing-key"

# Configure env BEFORE importing the app so it picks up the test key
os.environ["MAILGUN_WEBHOOK_SIGNING_KEY"] = SIGNING_KEY

from main import app  # noqa: E402


def build_signature(timestamp=None, token=None, signing_key=SIGNING_KEY):
    ts = timestamp or str(int(time.time()))
    tk = token or secrets.token_hex(25)
    sig = hmac.new(
        signing_key.encode(),
        (ts + tk).encode(),
        hashlib.sha256,
    ).hexdigest()
    return {"timestamp": ts, "token": tk, "signature": sig}


def build_payload(event, extra=None):
    extra = extra or {}
    return {
        "signature": build_signature(),
        "event-data": {
            "event": event,
            "id": "CPgfbmQMTCKtHW6uIWtuVe",
            "timestamp": time.time(),
            "recipient": "alice@example.com",
            **extra,
        },
    }


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_health_check():
    async with _client() as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_missing_signature():
    async with _client() as client:
        response = await client.post(
            "/webhooks/mailgun",
            json={"event-data": {"event": "delivered"}},
        )
    assert response.status_code == 400
    assert "Missing signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_signature():
    payload = {
        "signature": {
            "timestamp": "1700000000",
            "token": "abcdef0123456789abcdef0123456789abcdef0123456789ab",
            "signature": "deadbeef" * 8,
        },
        "event-data": {"event": "delivered", "recipient": "alice@example.com"},
    }
    async with _client() as client:
        response = await client.post("/webhooks/mailgun", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


@pytest.mark.asyncio
async def test_signature_with_wrong_key():
    sig = build_signature(signing_key="WRONG-KEY")
    payload = {
        "signature": sig,
        "event-data": {"event": "delivered", "recipient": "alice@example.com"},
    }
    async with _client() as client:
        response = await client.post("/webhooks/mailgun", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signature_missing_inner_fields():
    payload = {
        "signature": {"signature": "abc"},
        "event-data": {"event": "delivered"},
    }
    async with _client() as client:
        response = await client.post("/webhooks/mailgun", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_invalid_json():
    async with _client() as client:
        response = await client.post(
            "/webhooks/mailgun",
            content="not-json",
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON payload"


@pytest.mark.asyncio
async def test_valid_signature_returns_200():
    payload = build_payload("delivered")
    async with _client() as client:
        response = await client.post("/webhooks/mailgun", json=payload)
    assert response.status_code == 200
    assert response.json() == {"received": True}


@pytest.mark.asyncio
async def test_missing_event_data():
    payload = {"signature": build_signature()}
    async with _client() as client:
        response = await client.post("/webhooks/mailgun", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_all_event_types():
    events = [
        ("accepted", {}),
        ("rejected", {"reject": {"reason": "Suppressed"}}),
        ("delivered", {}),
        ("failed", {"severity": "permanent", "delivery-status": {"code": 550}}),
        ("failed", {"severity": "temporary", "delivery-status": {"code": 421}}),
        ("opened", {"ip": "1.2.3.4"}),
        ("clicked", {"url": "https://example.com", "ip": "1.2.3.4"}),
        ("unsubscribed", {}),
        ("complained", {}),
        ("stored", {"storage": {"url": "https://...", "key": "abc"}}),
        ("list_member_uploaded", {"mailing-list": {"address": "list@x.com"}}),
        ("unknown.event", {}),
    ]
    async with _client() as client:
        for event, extra in events:
            payload = build_payload(event, extra)
            response = await client.post("/webhooks/mailgun", json=payload)
            assert response.status_code == 200, f"failed for event {event}"


@pytest.mark.asyncio
async def test_parent_signature_valid():
    os.environ["MAILGUN_PARENT_WEBHOOK_SIGNING_KEY"] = PARENT_KEY
    try:
        sig = build_signature()
        parent_sig = hmac.new(
            PARENT_KEY.encode(),
            (sig["timestamp"] + sig["token"]).encode(),
            hashlib.sha256,
        ).hexdigest()
        payload = {
            "signature": {**sig, "parent-signature": parent_sig},
            "event-data": {"event": "delivered", "recipient": "alice@example.com"},
        }
        async with _client() as client:
            response = await client.post("/webhooks/mailgun", json=payload)
        assert response.status_code == 200
    finally:
        del os.environ["MAILGUN_PARENT_WEBHOOK_SIGNING_KEY"]


@pytest.mark.asyncio
async def test_parent_signature_invalid():
    os.environ["MAILGUN_PARENT_WEBHOOK_SIGNING_KEY"] = PARENT_KEY
    try:
        sig = build_signature()
        payload = {
            "signature": {**sig, "parent-signature": "a" * 64},
            "event-data": {"event": "delivered", "recipient": "alice@example.com"},
        }
        async with _client() as client:
            response = await client.post("/webhooks/mailgun", json=payload)
        assert response.status_code == 400
        assert "parent-signature" in response.json()["detail"]
    finally:
        del os.environ["MAILGUN_PARENT_WEBHOOK_SIGNING_KEY"]
