import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["COURIER_WEBHOOK_SECRET"] = "courier_test_secret"

from main import app, verify_courier_signature

client = TestClient(app)

WEBHOOK_SECRET = os.environ["COURIER_WEBHOOK_SECRET"]


def generate_courier_signature(payload: str, secret: str, timestamp=None) -> str:
    """Generate a valid Courier signature header for testing.

    Signed content is `<timestamp>.<payload>`, HMAC-SHA256 hex.
    """
    if timestamp is None:
        timestamp = int(time.time() * 1000)
    signed_payload = f"{timestamp}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},signature={signature}"


class TestVerifyCourierSignature:
    def test_accepts_valid_signature(self):
        payload = json.dumps({"type": "message:updated", "data": {"id": "m1"}})
        header = generate_courier_signature(payload, WEBHOOK_SECRET)
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is True

    def test_rejects_missing_header(self):
        assert verify_courier_signature(b"{}", None, WEBHOOK_SECRET) is False

    def test_rejects_malformed_header(self):
        assert verify_courier_signature(b"{}", "not-a-signature", WEBHOOK_SECRET) is False

    def test_rejects_invalid_signature(self):
        payload = json.dumps({"type": "message:updated", "data": {}})
        header = f"t={int(time.time() * 1000)},signature=deadbeef"
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is False

    def test_rejects_tampered_payload(self):
        original = json.dumps({"type": "message:updated", "data": {"id": "m1"}})
        header = generate_courier_signature(original, WEBHOOK_SECRET)
        tampered = json.dumps({"type": "message:updated", "data": {"id": "HACKED"}})
        assert verify_courier_signature(tampered.encode(), header, WEBHOOK_SECRET) is False

    def test_rejects_stale_timestamp(self):
        payload = json.dumps({"type": "message:updated", "data": {}})
        stale_ts = int(time.time() * 1000) - 10 * 60 * 1000  # 10 minutes ago
        header = generate_courier_signature(payload, WEBHOOK_SECRET, stale_ts)
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is False

    def test_accepts_seconds_precision_timestamp(self):
        # Courier documents milliseconds; seconds are accepted defensively.
        payload = json.dumps({"type": "message:updated", "data": {"id": "m1"}})
        header = generate_courier_signature(payload, WEBHOOK_SECRET, int(time.time()))
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is True

    def test_rejects_stale_seconds_precision_timestamp(self):
        payload = json.dumps({"type": "message:updated", "data": {}})
        stale_s = int(time.time()) - 10 * 60  # 10 minutes ago
        header = generate_courier_signature(payload, WEBHOOK_SECRET, stale_s)
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is False

    def test_rejects_non_numeric_timestamp(self):
        payload = json.dumps({"type": "message:updated", "data": {}})
        header = generate_courier_signature(payload, WEBHOOK_SECRET, "not-a-timestamp")
        assert verify_courier_signature(payload.encode(), header, WEBHOOK_SECRET) is False

    def test_matches_documented_json_dumps_form_for_unmodified_body(self):
        # Courier documents the signed content as `${t}.${JSON.stringify(body)}`;
        # this skill signs `${t}.${raw_body}`. For a delivery we have not
        # modified the two inputs are byte-identical, so the digests match.
        raw_body = json.dumps(
            {"type": "message:updated", "data": {"id": "m1", "status": "DELIVERED"}}
        )
        timestamp = int(time.time() * 1000)
        docs_payload = f"{timestamp}.{json.dumps(json.loads(raw_body))}"
        docs_digest = hmac.new(
            WEBHOOK_SECRET.encode("utf-8"), docs_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        header = f"t={timestamp},signature={docs_digest}"
        assert verify_courier_signature(raw_body.encode(), header, WEBHOOK_SECRET) is True


class TestCourierWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/courier",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.text

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"type": "message:updated", "data": {"id": "m1"}})
        response = client.post(
            "/webhooks/courier",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "courier-signature": f"t={int(time.time() * 1000)},signature=deadbeef",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {"type": "message:updated", "data": {"id": "m1", "status": "DELIVERED"}}
        )
        header = generate_courier_signature(payload, WEBHOOK_SECRET)
        response = client.post(
            "/webhooks/courier",
            content=payload,
            headers={"Content-Type": "application/json", "courier-signature": header},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_event_types(self):
        event_types = [
            "message:updated",
            "notification:submitted",
            "notification:submission_canceled",
            "notification:published",
            "audiences:updated",
            "audiences:user:matched",
            "audiences:user:unmatched",
            "audiences:calculated",
            "unknown:event",
        ]
        for event_type in event_types:
            payload = json.dumps({"type": event_type, "data": {"id": "obj_123"}})
            header = generate_courier_signature(payload, WEBHOOK_SECRET)
            response = client.post(
                "/webhooks/courier",
                content=payload,
                headers={"Content-Type": "application/json", "courier-signature": header},
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
