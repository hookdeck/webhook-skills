import os
import json
import hmac
import hashlib
import base64
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["HUBSPOT_CLIENT_SECRET"] = "test_client_secret"

from main import app, verify_hubspot_webhook  # noqa: E402

import main  # noqa: E402

# main.py reads HUBSPOT_CLIENT_SECRET at import time; refresh it for tests.
main.hubspot_client_secret = os.environ["HUBSPOT_CLIENT_SECRET"]

SECRET = os.environ["HUBSPOT_CLIENT_SECRET"]

# Starlette TestClient defaults to base_url "http://testserver"
TEST_URI = "http://testserver/webhooks/hubspot"

client = TestClient(app)


def sign_hubspot(
    *,
    body: str,
    timestamp: str,
    method: str = "POST",
    uri: str = TEST_URI,
    secret: str = SECRET,
) -> str:
    """Generate a valid HubSpot v3 signature for testing."""
    signed_content = f"{method}{uri}{body}{timestamp}"
    return base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            signed_content.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")


def now_ms() -> str:
    return str(int(time.time() * 1000))


class TestVerifyHubSpotWebhook:
    """Unit tests for the verification function."""

    def test_valid_signature_returns_true(self):
        body = '[{"subscriptionType":"contact.creation","objectId":1}]'
        timestamp = now_ms()
        signature = sign_hubspot(body=body, timestamp=timestamp)

        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=body.encode("utf-8"),
            timestamp=timestamp,
            signature=signature,
            secret=SECRET,
        ) is True

    def test_invalid_signature_returns_false(self):
        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=b"{}",
            timestamp=now_ms(),
            signature="not-a-real-signature",
            secret=SECRET,
        ) is False

    def test_stale_timestamp_returns_false(self):
        body = "{}"
        stale = str(int(time.time() * 1000) - 6 * 60 * 1000)
        signature = sign_hubspot(body=body, timestamp=stale)

        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=body.encode("utf-8"),
            timestamp=stale,
            signature=signature,
            secret=SECRET,
        ) is False

    def test_tampered_body_returns_false(self):
        original = '{"id":1}'
        tampered = '{"id":999}'
        timestamp = now_ms()
        signature = sign_hubspot(body=original, timestamp=timestamp)

        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=tampered.encode("utf-8"),
            timestamp=timestamp,
            signature=signature,
            secret=SECRET,
        ) is False

    def test_different_uri_returns_false(self):
        body = "{}"
        timestamp = now_ms()
        signature = sign_hubspot(body=body, timestamp=timestamp, uri=TEST_URI)

        assert verify_hubspot_webhook(
            method="POST",
            uri="http://attacker.example.com/webhooks/hubspot",
            raw_body=body.encode("utf-8"),
            timestamp=timestamp,
            signature=signature,
            secret=SECRET,
        ) is False

    def test_wrong_secret_returns_false(self):
        body = "{}"
        timestamp = now_ms()
        signature = sign_hubspot(body=body, timestamp=timestamp)

        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=body.encode("utf-8"),
            timestamp=timestamp,
            signature=signature,
            secret="wrong_secret",
        ) is False

    def test_missing_signature_returns_false(self):
        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=b"{}",
            timestamp=now_ms(),
            signature="",
            secret=SECRET,
        ) is False

    def test_missing_timestamp_returns_false(self):
        assert verify_hubspot_webhook(
            method="POST",
            uri=TEST_URI,
            raw_body=b"{}",
            timestamp="",
            signature="anything",
            secret=SECRET,
        ) is False


class TestHubSpotWebhookEndpoint:
    """Integration tests for the FastAPI endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/hubspot",
            content="[]",
            headers={
                "Content-Type": "application/json",
                "X-HubSpot-Request-Timestamp": now_ms(),
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/hubspot",
            content="[]",
            headers={
                "Content-Type": "application/json",
                "X-HubSpot-Signature-v3": "invalid",
                "X-HubSpot-Request-Timestamp": now_ms(),
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = json.dumps([
            {"subscriptionType": "contact.creation", "objectId": 123},
        ])
        timestamp = now_ms()
        signature = sign_hubspot(body=body, timestamp=timestamp)

        response = client.post(
            "/webhooks/hubspot",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-HubSpot-Signature-v3": signature,
                "X-HubSpot-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_event_batch(self):
        body = json.dumps([
            {"subscriptionType": "contact.creation", "objectId": 1},
            {"subscriptionType": "contact.propertyChange", "objectId": 1, "propertyName": "email", "propertyValue": "a@b.com"},
            {"subscriptionType": "contact.deletion", "objectId": 2},
            {"subscriptionType": "company.creation", "objectId": 3},
            {"subscriptionType": "company.propertyChange", "objectId": 3, "propertyName": "name"},
            {"subscriptionType": "deal.creation", "objectId": 4},
            {"subscriptionType": "deal.propertyChange", "objectId": 4, "propertyName": "amount", "propertyValue": 100},
            {"subscriptionType": "ticket.creation", "objectId": 5},
        ])
        timestamp = now_ms()
        signature = sign_hubspot(body=body, timestamp=timestamp)

        response = client.post(
            "/webhooks/hubspot",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-HubSpot-Signature-v3": signature,
                "X-HubSpot-Request-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200

    def test_stale_timestamp_returns_400(self):
        body = "[]"
        stale = str(int(time.time() * 1000) - 6 * 60 * 1000)
        signature = sign_hubspot(body=body, timestamp=stale)

        response = client.post(
            "/webhooks/hubspot",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-HubSpot-Signature-v3": signature,
                "X-HubSpot-Request-Timestamp": stale,
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
