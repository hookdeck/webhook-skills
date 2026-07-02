import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ZOOM_WEBHOOK_SECRET_TOKEN"] = "test_zoom_secret_token"

from main import app, verify_zoom_webhook, build_validation_response

client = TestClient(app)

SECRET = os.environ["ZOOM_WEBHOOK_SECRET_TOKEN"]
TIMESTAMP = "1658940994"


def generate_zoom_signature(payload: str, timestamp: str, secret: str) -> str:
    """Generate a valid Zoom signature for testing.

    Matches Zoom: v0=HMAC-SHA256("v0:{timestamp}:{body}", secretToken)
    """
    message = f"v0:{timestamp}:{payload}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"v0={digest}"


class TestVerifyZoomWebhook:
    """Tests for the Zoom signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = '{"event":"meeting.started"}'
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        assert verify_zoom_webhook(
            payload.encode(), TIMESTAMP, signature, SECRET
        ) is True

    def test_invalid_signature_returns_false(self):
        payload = '{"event":"meeting.started"}'

        assert verify_zoom_webhook(
            payload.encode(), TIMESTAMP, "v0=invalid", SECRET
        ) is False

    def test_tampered_body_returns_false(self):
        payload = '{"event":"meeting.started"}'
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        assert verify_zoom_webhook(
            b'{"event":"meeting.ended"}', TIMESTAMP, signature, SECRET
        ) is False

    def test_wrong_secret_returns_false(self):
        payload = '{"event":"meeting.started"}'
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        assert verify_zoom_webhook(
            payload.encode(), TIMESTAMP, signature, "wrong_secret"
        ) is False

    def test_missing_signature_returns_false(self):
        payload = '{"event":"meeting.started"}'

        assert verify_zoom_webhook(payload.encode(), TIMESTAMP, None, SECRET) is False

    def test_missing_timestamp_returns_false(self):
        payload = '{"event":"meeting.started"}'
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        assert verify_zoom_webhook(payload.encode(), None, signature, SECRET) is False


class TestBuildValidationResponse:
    """Tests for the url_validation handshake helper."""

    def test_returns_plain_and_encrypted_token(self):
        plain_token = "qgg8vlvZRS6UYooatFL8Aw"
        result = build_validation_response(plain_token, SECRET)

        expected = hmac.new(
            SECRET.encode("utf-8"), plain_token.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        assert result == {"plainToken": plain_token, "encryptedToken": expected}
        assert len(result["encryptedToken"]) == 64


class TestZoomWebhookEndpoint:
    """Tests for the Zoom webhook endpoint."""

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/zoom",
            content='{"event":"meeting.started"}',
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
            },
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"event": "meeting.started"})
        response = client.post(
            "/webhooks/zoom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
                "x-zm-signature": "v0=invalid",
            },
        )
        assert response.status_code == 401

    def test_url_validation_handshake(self):
        plain_token = "qgg8vlvZRS6UYooatFL8Aw"
        payload = json.dumps(
            {
                "event": "endpoint.url_validation",
                "payload": {"plainToken": plain_token},
                "event_ts": 1654503849680,
            }
        )
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/zoom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
                "x-zm-signature": signature,
            },
        )

        expected_encrypted = hmac.new(
            SECRET.encode("utf-8"), plain_token.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        assert response.status_code == 200
        assert response.json() == {
            "plainToken": plain_token,
            "encryptedToken": expected_encrypted,
        }

    def test_valid_meeting_started_returns_200(self):
        payload = json.dumps(
            {
                "event": "meeting.started",
                "payload": {"object": {"id": "123456789", "topic": "Standup"}},
            }
        )
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/zoom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
                "x-zm-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_recording_completed(self):
        payload = json.dumps(
            {
                "event": "recording.completed",
                "payload": {"object": {"id": "123456789"}},
            }
        )
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/zoom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
                "x-zm-signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_participant_joined(self):
        payload = json.dumps(
            {
                "event": "meeting.participant_joined",
                "payload": {
                    "object": {
                        "id": "123456789",
                        "participant": {"user_name": "Jane"},
                    }
                },
            }
        )
        signature = generate_zoom_signature(payload, TIMESTAMP, SECRET)

        response = client.post(
            "/webhooks/zoom",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-zm-request-timestamp": TIMESTAMP,
                "x-zm-signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
