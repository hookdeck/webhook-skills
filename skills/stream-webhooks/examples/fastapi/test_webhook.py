import gzip
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Stream API secrets are opaque strings used as-is (UTF-8) as the HMAC key
os.environ["STREAM_API_SECRET"] = "test_stream_api_secret_0123456789abcdefghijklmnopqrstuvwxyz"
os.environ["STREAM_API_KEY"] = "a1b23cdefgh4"

from main import app, verify_stream_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["STREAM_API_SECRET"]
API_KEY = os.environ["STREAM_API_KEY"]

PAYLOAD = json.dumps(
    {"type": "message.new", "cid": "messaging:general", "message": {"id": "m1", "text": "hello"}}
).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    """Generate a valid Stream signature: hex HMAC-SHA256 of the body."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/stream",
        content=body,
        headers={"x-api-key": API_KEY, **(headers or {})},
    )


class TestVerifyStreamWebhook:
    def test_valid_signature(self):
        assert verify_stream_webhook(PAYLOAD, sign(PAYLOAD), SECRET) is True

    def test_invalid_signature(self):
        assert verify_stream_webhook(PAYLOAD, "deadbeef", SECRET) is False

    def test_missing_signature(self):
        assert verify_stream_webhook(PAYLOAD, None, SECRET) is False

    def test_wrong_secret(self):
        assert verify_stream_webhook(PAYLOAD, sign(PAYLOAD, "other"), SECRET) is False

    def test_tampered_body(self):
        assert verify_stream_webhook(PAYLOAD + b" ", sign(PAYLOAD), SECRET) is False


class TestStreamWebhookEndpoint:
    def test_valid_json_webhook(self):
        res = post(
            PAYLOAD,
            {
                "content-type": "application/json",
                "x-signature": sign(PAYLOAD),
                "x-webhook-id": "123e4567-e89b-12d3-a456-426614174000",
            },
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        res = post(PAYLOAD, {"content-type": "text/plain", "x-signature": sign(PAYLOAD)})
        assert res.status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "message.new",
            "message.updated",
            "message.deleted",
            "reaction.new",
            "channel.created",
            "user.updated",
            "member.added",
            "some.future_event",
        ],
    )
    def test_handles_events(self, event_type):
        body = json.dumps({"type": event_type, "cid": "messaging:general"}).encode()
        res = post(body, {"x-signature": sign(body)})
        assert res.status_code == 200

    def test_invalid_signature(self):
        res = post(PAYLOAD, {"x-signature": "bad"})
        assert res.status_code == 400

    def test_missing_signature(self):
        res = post(PAYLOAD)
        assert res.status_code == 400

    def test_mismatched_api_key(self):
        res = post(PAYLOAD, {"x-signature": sign(PAYLOAD), "x-api-key": "someone_else"})
        assert res.status_code == 400

    def test_gzip_body_verified_on_uncompressed_bytes(self):
        res = post(gzip.compress(PAYLOAD), {"x-signature": sign(PAYLOAD)})
        assert res.status_code == 200

    def test_gzip_body_signed_over_compressed_bytes_rejected(self):
        gz = gzip.compress(PAYLOAD)
        res = post(gz, {"x-signature": sign(gz)})
        assert res.status_code == 400

    def test_invalid_json_with_valid_signature(self):
        body = b"not json"
        res = post(body, {"x-signature": sign(body)})
        assert res.status_code == 400
