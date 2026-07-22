import os
import json
import hmac
import hashlib

# Set test environment variables before importing the app.
os.environ["WHATSAPP_APP_SECRET"] = "test_app_secret"
os.environ["WHATSAPP_VERIFY_TOKEN"] = "test_verify_token"

from fastapi.testclient import TestClient

from main import app, verify_whatsapp_signature

client = TestClient(app)

APP_SECRET = os.environ["WHATSAPP_APP_SECRET"]
VERIFY_TOKEN = os.environ["WHATSAPP_VERIFY_TOKEN"]


def generate_signature(payload: bytes, secret: str) -> str:
    """Generate a valid WhatsApp X-Hub-Signature-256 header for testing."""
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


MESSAGE_PAYLOAD = json.dumps(
    {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "123456"},
                            "messages": [
                                {
                                    "from": "15551234567",
                                    "id": "wamid.ABC",
                                    "type": "text",
                                    "text": {"body": "Hello"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }
)

STATUS_PAYLOAD = json.dumps(
    {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "123456"},
                            "statuses": [
                                {
                                    "id": "wamid.ABC",
                                    "status": "delivered",
                                    "recipient_id": "15551234567",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }
)


class TestVerifyWhatsAppSignature:
    """Unit tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        body = MESSAGE_PAYLOAD.encode()
        signature = generate_signature(body, APP_SECRET)
        assert verify_whatsapp_signature(body, signature, APP_SECRET) is True

    def test_invalid_signature_returns_false(self):
        body = MESSAGE_PAYLOAD.encode()
        assert verify_whatsapp_signature(body, "sha256=deadbeef", APP_SECRET) is False

    def test_missing_signature_returns_false(self):
        body = MESSAGE_PAYLOAD.encode()
        assert verify_whatsapp_signature(body, None, APP_SECRET) is False

    def test_malformed_header_returns_false(self):
        body = MESSAGE_PAYLOAD.encode()
        assert verify_whatsapp_signature(body, "not_a_valid_format", APP_SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = MESSAGE_PAYLOAD.encode()
        signature = generate_signature(body, APP_SECRET)
        assert verify_whatsapp_signature(body, signature, "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        body = MESSAGE_PAYLOAD.encode()
        signature = generate_signature(body, APP_SECRET)
        tampered = MESSAGE_PAYLOAD.replace("Hello", "Goodbye").encode()
        assert verify_whatsapp_signature(tampered, signature, APP_SECRET) is False


class TestVerificationHandshake:
    """Tests for the GET verification handshake."""

    def test_echoes_challenge_when_token_matches(self):
        response = client.get(
            "/webhooks/whatsapp",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": VERIFY_TOKEN,
                "hub.challenge": "1158201444",
            },
        )
        assert response.status_code == 200
        assert response.text == "1158201444"

    def test_returns_403_for_wrong_token(self):
        response = client.get(
            "/webhooks/whatsapp",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong_token",
                "hub.challenge": "1158201444",
            },
        )
        assert response.status_code == 403

    def test_returns_403_for_wrong_mode(self):
        response = client.get(
            "/webhooks/whatsapp",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": VERIFY_TOKEN,
                "hub.challenge": "1158201444",
            },
        )
        assert response.status_code == 403


class TestWhatsAppWebhook:
    """Tests for the POST event delivery endpoint."""

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/whatsapp",
            content=MESSAGE_PAYLOAD,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = client.post(
            "/webhooks/whatsapp",
            content=MESSAGE_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=deadbeef",
            },
        )
        assert response.status_code == 401

    def test_valid_inbound_message_returns_200(self):
        signature = generate_signature(MESSAGE_PAYLOAD.encode(), APP_SECRET)
        response = client.post(
            "/webhooks/whatsapp",
            content=MESSAGE_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_status_update_returns_200(self):
        signature = generate_signature(STATUS_PAYLOAD.encode(), APP_SECRET)
        response = client.post(
            "/webhooks/whatsapp",
            content=STATUS_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
