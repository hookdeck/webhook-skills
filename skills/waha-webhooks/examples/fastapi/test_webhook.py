import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "my-secret-key"
os.environ["WAHA_WEBHOOK_HMAC_KEY"] = SECRET

from main import app, verify_waha_signature  # noqa: E402

client = TestClient(app)

DOC_BODY = b'{"event":"message","session":"default","engine":"WEBJS"}'
DOC_SIG = (
    "208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8"
    "097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89"
)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Generate a real WAHA signature: hex HMAC-SHA512 of the raw body."""
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


def post(body: bytes, headers: dict = None, content_type: str = "application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/waha", content=body, headers=h)


MESSAGE = json.dumps(
    {
        "id": "evt_01hxyz",
        "timestamp": 1741249702485,
        "event": "message",
        "session": "default",
        "engine": "WEBJS",
        "payload": {"id": "true_11111111111@c.us_AAAA", "from": "11111111111@c.us", "body": "Hi there!"},
    }
).encode()


class TestVerifyWahaSignature:
    def test_matches_docs_test_vector(self):
        assert verify_waha_signature(DOC_BODY, DOC_SIG, "my-secret-key", "sha512")

    def test_rejects_tampered_body(self):
        assert not verify_waha_signature(DOC_BODY + b" ", DOC_SIG, "my-secret-key")

    def test_rejects_missing_signature_or_secret(self):
        assert not verify_waha_signature(DOC_BODY, None, "my-secret-key")
        assert not verify_waha_signature(DOC_BODY, DOC_SIG, None)

    def test_rejects_wrong_length_signature(self):
        assert not verify_waha_signature(DOC_BODY, "abc", "my-secret-key")

    def test_rejects_unsupported_algorithm(self):
        assert not verify_waha_signature(DOC_BODY, DOC_SIG, "my-secret-key", "sha256")


class TestWebhookEndpoint:
    def test_accepts_valid_message_event(self):
        res = post(MESSAGE, {"X-Webhook-Hmac": sign(MESSAGE), "X-Webhook-Hmac-Algorithm": "sha512"})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize(
        "name",
        [
            "message",
            "message.any",
            "message.ack",
            "message.reaction",
            "session.status",
            "group.v2.join",
            "presence.update",
            "some.future.event",
        ],
    )
    def test_accepts_signed_events(self, name):
        body = json.dumps({"event": name, "session": "default", "engine": "WEBJS", "payload": {}}).encode()
        assert post(body, {"X-Webhook-Hmac": sign(body)}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        res = post(MESSAGE, {"X-Webhook-Hmac": sign(MESSAGE)}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_missing_signature_header(self):
        assert post(MESSAGE).status_code == 400

    def test_rejects_invalid_signature(self):
        assert post(MESSAGE, {"X-Webhook-Hmac": sign(MESSAGE, "wrong-key")}).status_code == 400

    def test_rejects_body_modified_after_signing(self):
        tampered = MESSAGE.replace(b"Hi there!", b"Hacked")
        assert post(tampered, {"X-Webhook-Hmac": sign(MESSAGE)}).status_code == 400

    def test_rejects_non_sha512_algorithm_header(self):
        res = post(MESSAGE, {"X-Webhook-Hmac": sign(MESSAGE), "X-Webhook-Hmac-Algorithm": "sha256"})
        assert res.status_code == 400

    def test_rejects_signed_invalid_json(self):
        bad = b"{not json"
        assert post(bad, {"X-Webhook-Hmac": sign(bad)}).status_code == 400
