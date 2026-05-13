import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ORB_WEBHOOK_SECRET"] = "test_webhook_secret"

from main import app, is_timestamp_fresh, verify_orb_signature  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["ORB_WEBHOOK_SECRET"]


def generate_orb_signature(payload: str, secret: str, timestamp: str | None = None):
    """Generate a valid Orb signature for testing.

    Signed content: `v1:{timestamp}:{payload}`
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat()
    signed_content = f"v1:{timestamp}:".encode("utf-8") + payload.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()
    return f"v1={digest}", timestamp


class TestVerifyOrbSignature:
    def test_accepts_valid_signature(self):
        payload = '{"id":"evt_1","type":"invoice.issued"}'
        signature, timestamp = generate_orb_signature(payload, WEBHOOK_SECRET)
        assert verify_orb_signature(payload.encode("utf-8"), signature, timestamp, WEBHOOK_SECRET)

    def test_rejects_invalid_signature(self):
        timestamp = datetime.now(timezone.utc).isoformat()
        assert not verify_orb_signature(b"{}", "v1=deadbeef", timestamp, WEBHOOK_SECRET)

    def test_rejects_missing_signature(self):
        timestamp = datetime.now(timezone.utc).isoformat()
        assert not verify_orb_signature(b"{}", None, timestamp, WEBHOOK_SECRET)

    def test_rejects_missing_timestamp(self):
        assert not verify_orb_signature(b"{}", "v1=deadbeef", None, WEBHOOK_SECRET)

    def test_rejects_tampered_payload(self):
        original = '{"id":"evt_1","amount":100}'
        signature, timestamp = generate_orb_signature(original, WEBHOOK_SECRET)
        tampered = '{"id":"evt_1","amount":999}'
        assert not verify_orb_signature(
            tampered.encode("utf-8"), signature, timestamp, WEBHOOK_SECRET
        )

    def test_accepts_signature_without_v1_prefix(self):
        payload = '{"id":"evt_1"}'
        signature, timestamp = generate_orb_signature(payload, WEBHOOK_SECRET)
        bare = signature[3:]  # strip "v1="
        assert verify_orb_signature(payload.encode("utf-8"), bare, timestamp, WEBHOOK_SECRET)


class TestIsTimestampFresh:
    def test_accepts_current_timestamp(self):
        assert is_timestamp_fresh(datetime.now(timezone.utc).isoformat())

    def test_rejects_stale_timestamp(self):
        stale = (datetime.now(timezone.utc) - timedelta(seconds=400)).isoformat()
        assert not is_timestamp_fresh(stale)

    def test_rejects_unparseable_timestamp(self):
        assert not is_timestamp_fresh("not-a-date")
        assert not is_timestamp_fresh(None)

    def test_accepts_z_suffix(self):
        # Orb delivers ISO 8601 with millisecond precision; trailing Z must parse.
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        assert is_timestamp_fresh(ts)


class TestOrbWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/orb",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing Orb signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"id": "evt_test", "type": "invoice.issued"})
        timestamp = datetime.now(timezone.utc).isoformat()
        response = client.post(
            "/webhooks/orb",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Orb-Signature": "v1=invalid_signature",
                "X-Orb-Timestamp": timestamp,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"id": "evt_test", "type": "invoice.issued", "amount": 100})
        signature, timestamp = generate_orb_signature(original, WEBHOOK_SECRET)
        tampered = json.dumps({"id": "evt_test", "type": "invoice.issued", "amount": 999})

        response = client.post(
            "/webhooks/orb",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Orb-Signature": signature,
                "X-Orb-Timestamp": timestamp,
            },
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"id": "evt_test", "type": "invoice.issued"})
        stale_ts = (datetime.now(timezone.utc) - timedelta(seconds=600)).isoformat()
        signature, _ = generate_orb_signature(payload, WEBHOOK_SECRET, stale_ts)

        response = client.post(
            "/webhooks/orb",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Orb-Signature": signature,
                "X-Orb-Timestamp": stale_ts,
            },
        )
        assert response.status_code == 400
        assert "Timestamp" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "id": "evt_valid",
                "type": "invoice.issued",
                "properties": {"invoice_id": "invoice_01"},
            }
        )
        signature, timestamp = generate_orb_signature(payload, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/orb",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Orb-Signature": signature,
                "X-Orb-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        [
            "customer.created",
            "customer.credit_balance_dropped",
            "subscription.created",
            "subscription.started",
            "subscription.ended",
            "subscription.plan_changed",
            "subscription.usage_exceeded",
            "invoice.issued",
            "invoice.payment_succeeded",
            "invoice.payment_failed",
            "data_exports.transfer_success",
            "unknown.event.type",
        ],
    )
    def test_handles_event_types(self, event_type: str):
        payload = json.dumps(
            {
                "id": f"evt_{event_type.replace('.', '_')}",
                "type": event_type,
                "properties": {},
            }
        )
        signature, timestamp = generate_orb_signature(payload, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/orb",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Orb-Signature": signature,
                "X-Orb-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
