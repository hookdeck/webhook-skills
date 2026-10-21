import hashlib
import hmac
import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["ZERNIO_WEBHOOK_SECRET"] = "test_zernio_secret"

from main import app, processed_events, verify_zernio_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["ZERNIO_WEBHOOK_SECRET"]


def generate_zernio_signature(payload: str, secret: str) -> str:
    """Generate a valid Zernio signature: lowercase hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def make_payload(event: str, **extra) -> str:
    return json.dumps({
        "id": str(uuid.uuid4()),
        "event": event,
        "timestamp": "2027-01-01T17:00:00Z",
        **extra,
    })


def post(payload: str, headers: dict):
    return client.post(
        "/webhooks/zernio",
        content=payload,
        headers={"Content-Type": "application/json", **headers},
    )


@pytest.fixture(autouse=True)
def clear_processed():
    processed_events.clear()


class TestVerifyZernioWebhook:
    def test_valid_signature(self):
        payload = b'{"event":"post.published"}'
        signature = generate_zernio_signature(payload.decode(), SECRET)
        assert verify_zernio_webhook(payload, signature, SECRET) is True

    def test_invalid_signature(self):
        assert verify_zernio_webhook(b"{}", "invalid", SECRET) is False

    def test_same_length_wrong_signature(self):
        assert verify_zernio_webhook(b"{}", "a" * 64, SECRET) is False

    def test_missing_signature_or_secret(self):
        assert verify_zernio_webhook(b"{}", None, SECRET) is False
        assert verify_zernio_webhook(b"{}", "abc", None) is False

    def test_altered_body(self):
        signature = generate_zernio_signature('{"a":1}', SECRET)
        assert verify_zernio_webhook(b'{"a":2}', signature, SECRET) is False


class TestZernioWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        response = post(make_payload("post.published"), {})
        assert response.status_code == 401

    def test_invalid_signature_returns_400(self):
        response = post(make_payload("post.published"), {"X-Zernio-Signature": "invalid"})
        assert response.status_code == 400

    def test_wrong_secret_returns_400(self):
        payload = make_payload("post.published")
        response = post(payload, {"X-Zernio-Signature": generate_zernio_signature(payload, "wrong_secret")})
        assert response.status_code == 400

    @pytest.mark.parametrize("event,extra", [
        ("post.scheduled", {"post": {"id": "p1", "scheduledFor": "2027-01-01T17:00:00Z"}}),
        ("post.published", {"post": {"id": "p1", "platforms": []}}),
        ("post.partial", {"post": {"id": "p1"}}),
        ("post.failed", {"post": {"id": "p1"}}),
        ("post.platform.published", {"post": {"id": "p1"}}),
        ("post.platform.failed", {"post": {"id": "p1"}}),
        ("message.received", {"message": {"platform": "instagram", "text": "hi"}}),
        ("comment.received", {"account": {"accountId": "a1"}}),
        ("account.connected", {"account": {"platform": "twitter", "username": "acme"}}),
        ("account.disconnected", {"account": {"disconnectionType": "unintentional", "reason": "token expired"}}),
        ("webhook.test", {"message": "This is a test webhook from Zernio"}),
    ])
    def test_valid_events(self, event, extra):
        payload = make_payload(event, **extra)
        response = post(payload, {"X-Zernio-Signature": generate_zernio_signature(payload, SECRET)})
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_legacy_signature_header(self):
        payload = make_payload("post.published")
        response = post(payload, {"X-Late-Signature": generate_zernio_signature(payload, SECRET)})
        assert response.status_code == 200

    def test_unhandled_event_is_acknowledged(self):
        payload = make_payload("lead.received")
        response = post(payload, {"X-Zernio-Signature": generate_zernio_signature(payload, SECRET)})
        assert response.status_code == 200

    def test_duplicate_event_is_deduplicated(self):
        payload = make_payload("post.published")
        headers = {"X-Zernio-Signature": generate_zernio_signature(payload, SECRET)}
        assert post(payload, headers).json() == {"received": True}
        second = post(payload, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}

    def test_malformed_json_returns_400(self):
        payload = "not json"
        response = post(payload, {"X-Zernio-Signature": generate_zernio_signature(payload, SECRET)})
        assert response.status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
