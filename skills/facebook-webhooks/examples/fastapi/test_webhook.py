import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["FACEBOOK_APP_SECRET"] = "test_app_secret"
os.environ["FACEBOOK_VERIFY_TOKEN"] = "test_verify_token"

from main import app, verify_facebook_signature

client = TestClient(app)

APP_SECRET = "test_app_secret"


def generate_signature(payload: str, app_secret: str) -> str:
    """Generate a valid Facebook X-Hub-Signature-256 value for testing."""
    signature = hmac.new(
        app_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={signature}"


class TestVerifyFacebookSignature:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"object":"page","entry":[]}'
        signature = generate_signature(payload.decode(), APP_SECRET)
        assert verify_facebook_signature(payload, signature, APP_SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"object":"page","entry":[]}'
        assert verify_facebook_signature(payload, "sha256=deadbeef", APP_SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"object":"page","entry":[]}'
        assert verify_facebook_signature(payload, None, APP_SECRET) is False

    def test_legacy_sha1_header_returns_false(self):
        payload = b'{"object":"page","entry":[]}'
        sha1 = hmac.new(APP_SECRET.encode(), payload, hashlib.sha1).hexdigest()
        assert verify_facebook_signature(payload, f"sha1={sha1}", APP_SECRET) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"object":"page","entry":[{"id":"1"}]}'
        signature = generate_signature(original.decode(), APP_SECRET)
        tampered = b'{"object":"page","entry":[{"id":"999"}]}'
        assert verify_facebook_signature(tampered, signature, APP_SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"object":"page","entry":[]}'
        signature = generate_signature(payload.decode(), APP_SECRET)
        assert verify_facebook_signature(payload, signature, "wrong_secret") is False


class TestVerificationHandshake:
    """Tests for the GET verification handshake."""

    def test_echoes_challenge_when_token_matches(self):
        response = client.get(
            "/webhooks/facebook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "test_verify_token",
                "hub.challenge": "1234567890",
            },
        )
        assert response.status_code == 200
        assert response.text == "1234567890"

    def test_returns_403_when_token_mismatch(self):
        response = client.get(
            "/webhooks/facebook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong_token",
                "hub.challenge": "1234567890",
            },
        )
        assert response.status_code == 403

    def test_returns_403_when_mode_not_subscribe(self):
        response = client.get(
            "/webhooks/facebook",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": "test_verify_token",
                "hub.challenge": "1234567890",
            },
        )
        assert response.status_code == 403


class TestReceiveWebhook:
    """Tests for the POST event delivery endpoint."""

    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/facebook",
            content='{"object":"page","entry":[]}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        payload = json.dumps({"object": "page", "entry": []})
        response = client.post(
            "/webhooks/facebook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=invalid",
            },
        )
        assert response.status_code == 401

    def test_valid_page_feed_event_returns_200(self):
        payload = json.dumps({
            "object": "page",
            "entry": [
                {
                    "id": "page-1",
                    "time": 1458692752,
                    "changes": [{"field": "feed", "value": {"item": "comment", "verb": "add"}}],
                }
            ],
        })
        signature = generate_signature(payload, APP_SECRET)
        response = client.post(
            "/webhooks/facebook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200
        assert response.text == "EVENT_RECEIVED"

    def test_handles_instagram_comments_event(self):
        payload = json.dumps({
            "object": "instagram",
            "entry": [
                {"id": "ig-1", "time": 1, "changes": [{"field": "comments", "value": {"id": "c-1"}}]}
            ],
        })
        signature = generate_signature(payload, APP_SECRET)
        response = client.post(
            "/webhooks/facebook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_messenger_event(self):
        payload = json.dumps({
            "object": "page",
            "entry": [
                {
                    "id": "page-1",
                    "time": 1,
                    "messaging": [{"sender": {"id": "psid-1"}, "message": {"text": "Hello"}}],
                }
            ],
        })
        signature = generate_signature(payload, APP_SECRET)
        response = client.post(
            "/webhooks/facebook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_batch_of_entries(self):
        payload = json.dumps({
            "object": "page",
            "entry": [
                {"id": "page-1", "time": 1, "changes": [{"field": "feed", "value": {}}]},
                {"id": "page-2", "time": 2, "changes": [{"field": "mention", "value": {}}]},
            ],
        })
        signature = generate_signature(payload, APP_SECRET)
        response = client.post(
            "/webhooks/facebook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
