import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FIREFLIES_WEBHOOK_SECRET"] = "test_fireflies_secret_1234"

from main import app, verify_fireflies_webhook

client = TestClient(app)


def generate_fireflies_signature(payload: str, secret: str) -> str:
    """Generate a valid Fireflies Webhooks V2 signature for testing.

    HMAC-SHA256 over the raw body, hex-encoded, with the ``sha256=`` prefix.
    """
    digest = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    return f"sha256={digest}"


class TestVerifyFirefliesWebhook:
    """Tests for the Fireflies V2 signature verification function."""

    secret = os.environ["FIREFLIES_WEBHOOK_SECRET"]

    def test_valid_signature_returns_true(self):
        payload = b'{"event":"meeting.transcribed","meeting_id":"abc"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, signature, self.secret) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"meeting_id":"abc"}'

        assert verify_fireflies_webhook(payload, "sha256=deadbeef", self.secret) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"meeting_id":"abc"}'

        assert verify_fireflies_webhook(payload, None, self.secret) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"meeting_id":"abc"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, signature, "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        original = b'{"meeting_id":"abc"}'
        signature = generate_fireflies_signature(original.decode(), self.secret)
        tampered = b'{"meeting_id":"xyz"}'

        assert verify_fireflies_webhook(tampered, signature, self.secret) is False

    def test_missing_prefix_returns_false(self):
        # The "sha256=" prefix is required; a bare hex digest is rejected
        payload = b'{"meeting_id":"abc"}'
        bare_hex = hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_fireflies_webhook(payload, bare_hex, self.secret) is False

    @pytest.mark.parametrize("prefix", ["sha1=", "sha256:", "SHA256=", ""])
    def test_malformed_prefix_returns_false(self, prefix):
        payload = b'{"meeting_id":"abc"}'
        bare_hex = hmac.new(
            self.secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()

        assert verify_fireflies_webhook(payload, prefix + bare_hex, self.secret) is False

    def test_no_secret_returns_false(self):
        payload = b'{"meeting_id":"abc"}'
        signature = generate_fireflies_signature(payload.decode(), self.secret)

        assert verify_fireflies_webhook(payload, signature, None) is False


class TestFirefliesWebhook:
    """Tests for the Fireflies webhook endpoint."""

    secret = os.environ["FIREFLIES_WEBHOOK_SECRET"]

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/fireflies",
            content='{"event":"meeting.transcribed","meeting_id":"abc"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"event": "meeting.transcribed", "meeting_id": "abc"})

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": "sha256=deadbeef",
            },
        )
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        original = json.dumps({"event": "meeting.transcribed", "meeting_id": "abc"})
        signature = generate_fireflies_signature(original, self.secret)
        tampered = json.dumps({"event": "meeting.transcribed", "meeting_id": "xyz"})

        response = client.post(
            "/webhooks/fireflies",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 401

    def test_missing_prefix_returns_401(self):
        payload = json.dumps({"event": "meeting.transcribed", "meeting_id": "abc"})
        bare_hex = hmac.new(
            self.secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": bare_hex,
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        payload = json.dumps({
            "event": "meeting.transcribed",
            "timestamp": 1710876543210,
            "meeting_id": "ASxwZxCstx",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_client_reference_id(self):
        payload = json.dumps({
            "event": "meeting.transcribed",
            "timestamp": 1710876543210,
            "meeting_id": "ASxwZxCstx",
            "client_reference_id": "be582c46-4ac9-4565-9ba6-6ab4264496a8",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200

    @pytest.mark.parametrize("event", [
        "meeting.transcribed",
        "meeting.summarized",
        "meeting.bot_joined",
    ])
    def test_dispatches_each_event(self, event):
        payload = json.dumps({
            "event": event,
            "timestamp": 1710876543210,
            "meeting_id": "ASxwZxCstx",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_acknowledges_unknown_event_type(self):
        payload = json.dumps({
            "event": "meeting.some_future_event",
            "timestamp": 1710876543210,
            "meeting_id": "ASxwZxCstx",
        })
        signature = generate_fireflies_signature(payload, self.secret)

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-hub-signature": signature,
            },
        )
        assert response.status_code == 200


class TestNoSigningSecretConfigured:
    """Fireflies omits X-Hub-Signature entirely when no signing secret is set.

    This example accepts those deliveries with a warning - see main.py.
    """

    @pytest.fixture(autouse=True)
    def unset_secret(self):
        original = os.environ.pop("FIREFLIES_WEBHOOK_SECRET", None)
        yield
        if original is not None:
            os.environ["FIREFLIES_WEBHOOK_SECRET"] = original

    def test_unsigned_delivery_is_accepted_with_warning(self, capsys):
        payload = json.dumps({
            "event": "meeting.transcribed",
            "timestamp": 1710876543210,
            "meeting_id": "ASxwZxCstx",
        })

        response = client.post(
            "/webhooks/fireflies",
            content=payload,
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}
        assert "UNVERIFIED" in capsys.readouterr().out


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
