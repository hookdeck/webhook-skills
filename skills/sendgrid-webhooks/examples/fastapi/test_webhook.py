import os
import json
import base64
import pytest
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import ec
from main import app

# Test webhook verification key (EC P-256 key for testing)
TEST_PRIVATE_KEY = """-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgpmQ3zf+bk6YSlk1D
P/KbVCTBI/BWszZDLaxJbhFsgHGhRANCAASLvm+bKJtz2V4nR78IX8A8ZEi3gQXK
96XBzIWdhjkj/ypkZVt/BfmpNG+AL94XiGSjxiV8IcNkDP//EScDI4BX
-----END PRIVATE KEY-----"""

TEST_PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEi75vmyibc9leJ0e/CF/APGRIt4EFyvelwcyFnYY5I/8qZGVbfwX5qTRvgC/eF4hko8YlfCHDZAz//xEnAyOAVw=="

# Set test environment variable
os.environ["SENDGRID_WEBHOOK_VERIFICATION_KEY"] = TEST_PUBLIC_KEY


def generate_signature(payload: str, timestamp: str) -> str:
    """Generate test signature using the test private key"""
    # Load private key
    private_key = serialization.load_pem_private_key(
        TEST_PRIVATE_KEY.encode(),
        password=None
    )

    # Create signed content
    signed_content = (timestamp + payload).encode('utf-8')

    # Sign the content
    signature = private_key.sign(
        signed_content,
        ec.ECDSA(hashes.SHA256())
    )

    # Return base64 encoded signature
    return base64.b64encode(signature).decode('utf-8')


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_valid_webhook():
    timestamp = str(int(datetime.now().timestamp()))
    events = [
        {
            "email": "test@example.com",
            "timestamp": int(timestamp),
            "event": "delivered",
            "sg_event_id": "test-event-id",
            "sg_message_id": "test-message-id"
        }
    ]
    payload = json.dumps(events)
    signature = generate_signature(payload, timestamp)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": signature,
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_invalid_signature():
    timestamp = str(int(datetime.now().timestamp()))
    events = [{
        "email": "test@example.com",
        "timestamp": int(timestamp),
        "event": "delivered"
    }]
    payload = json.dumps(events)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": "invalid-signature",
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}


@pytest.mark.asyncio
async def test_missing_signature_header():
    timestamp = str(int(datetime.now().timestamp()))
    events = [{
        "email": "test@example.com",
        "timestamp": int(timestamp),
        "event": "delivered"
    }]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            json=events,
            headers={
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp
            }
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Missing signature headers"}


@pytest.mark.asyncio
async def test_missing_timestamp_header():
    events = [{
        "email": "test@example.com",
        "timestamp": int(datetime.now().timestamp()),
        "event": "delivered"
    }]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            json=events,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": "some-signature"
            }
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Missing signature headers"}


@pytest.mark.asyncio
async def test_multiple_events():
    timestamp = str(int(datetime.now().timestamp()))
    events = [
        {
            "email": "user1@example.com",
            "timestamp": int(timestamp),
            "event": "delivered",
            "sg_event_id": "event-1"
        },
        {
            "email": "user2@example.com",
            "timestamp": int(timestamp),
            "event": "bounce",
            "sg_event_id": "event-2",
            "reason": "Invalid email address"
        },
        {
            "email": "user3@example.com",
            "timestamp": int(timestamp),
            "event": "click",
            "sg_event_id": "event-3",
            "url": "https://example.com/link"
        }
    ]
    payload = json.dumps(events)
    signature = generate_signature(payload, timestamp)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": signature,
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_lowercase_headers():
    timestamp = str(int(datetime.now().timestamp()))
    events = [{
        "email": "test@example.com",
        "timestamp": int(timestamp),
        "event": "open"
    }]
    payload = json.dumps(events)
    signature = generate_signature(payload, timestamp)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "x-twilio-email-event-webhook-signature": signature,
                "x-twilio-email-event-webhook-timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_all_event_types():
    timestamp = str(int(datetime.now().timestamp()))
    events = [
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "delivered"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "bounce", "reason": "Invalid"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "open"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "click", "url": "https://example.com"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "spamreport"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "unsubscribe"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "deferred", "reason": "Mailbox full"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "dropped", "reason": "Bounced address"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "processed"},
        {"email": "test@example.com", "timestamp": int(timestamp), "event": "unknown_event"},
    ]
    payload = json.dumps(events)
    signature = generate_signature(payload, timestamp)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": signature,
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_invalid_json():
    timestamp = str(int(datetime.now().timestamp()))
    payload = "invalid-json"
    signature = generate_signature(payload, timestamp)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/webhooks/sendgrid",
            content=payload,
            headers={
                "X-Twilio-Email-Event-Webhook-Signature": signature,
                "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid JSON payload"}