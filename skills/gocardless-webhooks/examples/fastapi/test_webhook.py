"""Tests for the GoCardless FastAPI webhook handler.

Signatures are generated with the same HMAC-SHA256 (hex) algorithm GoCardless uses,
so these tests exercise the real verification path.
"""

import hashlib
import hmac
import json
import os

# Set the secret before importing the app
os.environ["GOCARDLESS_WEBHOOK_SECRET"] = "test_webhook_secret"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)

WEBHOOK_SECRET = "test_webhook_secret"


def sign(raw_body: bytes, secret: str) -> str:
    """Generate a valid GoCardless Webhook-Signature (HMAC-SHA256 hex)."""
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def events_body(events: list) -> bytes:
    return json.dumps({"events": events}).encode("utf-8")


def post(body: bytes, signature: str | None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["Webhook-Signature"] = signature
    return client.post("/webhooks/gocardless", content=body, headers=headers)


def test_valid_signature_returns_204():
    body = events_body(
        [
            {
                "id": "EV123",
                "created_at": "2014-08-04T12:00:00.000Z",
                "resource_type": "payments",
                "action": "confirmed",
                "links": {"payment": "PM123"},
            }
        ]
    )
    response = post(body, sign(body, WEBHOOK_SECRET))
    assert response.status_code == 204


def test_batch_of_multiple_events_returns_204():
    body = events_body(
        [
            {"id": "EV1", "resource_type": "payments", "action": "failed", "links": {"payment": "PM1"}},
            {"id": "EV2", "resource_type": "mandates", "action": "cancelled", "links": {"mandate": "MD1"}},
            {"id": "EV3", "resource_type": "payouts", "action": "paid", "links": {"payout": "PO1"}},
        ]
    )
    response = post(body, sign(body, WEBHOOK_SECRET))
    assert response.status_code == 204


def test_invalid_signature_returns_498():
    body = events_body(
        [{"id": "EV123", "resource_type": "payments", "action": "confirmed", "links": {}}]
    )
    response = post(body, "deadbeef")
    assert response.status_code == 498


def test_wrong_secret_returns_498():
    body = events_body(
        [{"id": "EV123", "resource_type": "payments", "action": "confirmed", "links": {}}]
    )
    response = post(body, sign(body, "the_wrong_secret"))
    assert response.status_code == 498


def test_missing_signature_returns_498():
    body = events_body(
        [{"id": "EV123", "resource_type": "payments", "action": "confirmed", "links": {}}]
    )
    response = post(body, None)
    assert response.status_code == 498


def test_tampered_body_returns_498():
    body = events_body(
        [{"id": "EV123", "resource_type": "payments", "action": "confirmed", "links": {}}]
    )
    signature = sign(body, WEBHOOK_SECRET)
    tampered = events_body(
        [{"id": "EV123", "resource_type": "payments", "action": "paid_out", "links": {}}]
    )
    response = post(tampered, signature)
    assert response.status_code == 498


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
