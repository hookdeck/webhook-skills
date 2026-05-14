import base64
import hashlib
import hmac
import json
import os
import time

os.environ["KNOCK_WEBHOOK_SECRET"] = "test_knock_signing_secret_value"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
SECRET = os.environ["KNOCK_WEBHOOK_SECRET"]


def generate_knock_signature(
    payload: str, secret: str, timestamp_ms: int | None = None
) -> str:
    """Build a valid x-knock-signature header for testing.

    Header format:  t=<timestamp_ms>,s=<base64_signature>
    Signed content: f"{timestamp_ms}.{payload}"

    Knock's timestamp is in MILLISECONDS, not seconds.
    """
    ts = str(timestamp_ms if timestamp_ms is not None else int(time.time() * 1000))
    signature = base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            f"{ts}.{payload}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")
    return f"t={ts},s={signature}"


class TestKnockWebhook:
    def test_missing_header_returns_400(self):
        response = client.post(
            "/webhooks/knock",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing x-knock-signature header" in response.json()["detail"]

    def test_malformed_header_returns_400(self):
        response = client.post(
            "/webhooks/knock",
            content="{}",
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": "not-a-real-header",
            },
        )
        assert response.status_code == 400
        assert "Malformed" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"id": "evt_1", "type": "message.sent"})
        ts = str(int(time.time() * 1000))
        response = client.post(
            "/webhooks/knock",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": f"t={ts},s=ZmFrZQ==",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"id": "evt_orig", "type": "message.sent"})
        header = generate_knock_signature(original, SECRET)
        tampered = json.dumps({"id": "evt_orig", "type": "message.read"})

        response = client.post(
            "/webhooks/knock",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": header,
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_expired_timestamp_returns_400(self):
        payload = json.dumps({"id": "evt_old", "type": "message.sent"})
        # 10 minutes ago, in milliseconds
        old_ts = int(time.time() * 1000) - 10 * 60 * 1000
        header = generate_knock_signature(payload, SECRET, old_ts)

        response = client.post(
            "/webhooks/knock",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": header,
            },
        )
        assert response.status_code == 400
        assert "Timestamp outside tolerance" in response.json()["detail"]

    def test_stripe_seconds_signature_rejected(self):
        """Regression: a Stripe-style seconds-based signature must NOT validate."""
        payload = json.dumps({"id": "evt_seconds", "type": "message.sent"})
        ts_seconds = str(int(time.time()))
        signature = base64.b64encode(
            hmac.new(
                SECRET.encode("utf-8"),
                f"{ts_seconds}.{payload}".encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode("utf-8")
        header = f"t={ts_seconds},s={signature}"

        response = client.post(
            "/webhooks/knock",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": header,
            },
        )
        # Seconds-since-epoch parsed as ms-since-epoch lands in ~1970 — outside tolerance.
        assert response.status_code == 400
        assert "Timestamp outside tolerance" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "id": "evt_valid",
                "type": "message.delivered",
                "data": {"id": "msg_valid"},
            }
        )
        header = generate_knock_signature(payload, SECRET)

        response = client.post(
            "/webhooks/knock",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-knock-signature": header,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_every_event_type(self):
        event_types = [
            "message.sent",
            "message.delivered",
            "message.delivery_attempted",
            "message.undelivered",
            "message.bounced",
            "message.seen",
            "message.unseen",
            "message.read",
            "message.unread",
            "message.archived",
            "message.unarchived",
            "message.interacted",
            "message.link_clicked",
            "workflow.updated",
            "workflow.committed",
            "email_layout.updated",
            "email_layout.committed",
            "translation.updated",
            "translation.committed",
            "source_event_action.updated",
            "source_event_action.committed",
            "partial.updated",
            "partial.committed",
            "unknown.event.type",
        ]

        for event_type in event_types:
            payload = json.dumps(
                {
                    "id": f"evt_{event_type.replace('.', '_')}",
                    "type": event_type,
                    "data": {
                        "id": "res_1",
                        "key": "k",
                        "locale_code": "en",
                    },
                    "event_data": {"url": "https://example.com"},
                }
            )
            header = generate_knock_signature(payload, SECRET)

            response = client.post(
                "/webhooks/knock",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-knock-signature": header,
                },
            )
            assert response.status_code == 200, (
                f"Failed for event type: {event_type}"
            )


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
