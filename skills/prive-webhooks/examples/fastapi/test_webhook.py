import os
import hmac
import base64
import hashlib

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PRIVE_WEBHOOK_SECRET"] = "test_prive_secret_token"

from main import app, verify_prive_signature, TOPICS

client = TestClient(app)
SECRET = os.environ["PRIVE_WEBHOOK_SECRET"]
HEADER = "x-prive-hmac-sha256"


def sign(payload: bytes, key: str = SECRET) -> str:
    """Prive: bare base64 HMAC-SHA256 of the raw body."""
    return base64.b64encode(
        hmac.new(key.encode(), payload, hashlib.sha256).digest()
    ).decode()


class TestVerifyPriveSignature:
    payload = b'{"id":"sub_123"}'

    def test_valid(self):
        assert verify_prive_signature(self.payload, sign(self.payload), SECRET) is True

    def test_missing(self):
        assert verify_prive_signature(self.payload, None, SECRET) is False

    def test_wrong_secret(self):
        assert verify_prive_signature(self.payload, sign(self.payload, "wrong"), SECRET) is False

    def test_tampered_body(self):
        assert verify_prive_signature(b'{"id":"sub_999"}', sign(self.payload), SECRET) is False

    def test_hex_digest_rejected(self):
        hex_digest = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert verify_prive_signature(self.payload, hex_digest, SECRET) is False

    def test_trailing_junk_rejected(self):
        assert verify_prive_signature(self.payload, sign(self.payload) + "AAAA", SECRET) is False

    def test_non_ascii_header_does_not_raise(self):
        assert verify_prive_signature(self.payload, "ünïcode", SECRET) is False


class TestGenericEndpoint:
    def test_valid_signature(self):
        payload = b'{"id":"sub_123"}'
        r = client.post("/webhooks/prive", content=payload, headers={HEADER: sign(payload)})
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_any_content_type(self):
        payload = b'{"id":"sub_123"}'
        r = client.post(
            "/webhooks/prive",
            content=payload,
            headers={HEADER: sign(payload), "content-type": "text/plain"},
        )
        assert r.status_code == 200

    def test_missing_signature(self):
        r = client.post("/webhooks/prive", content=b'{"id":"sub_123"}')
        assert r.status_code == 401

    def test_invalid_signature(self):
        r = client.post("/webhooks/prive", content=b"{}", headers={HEADER: "invalid"})
        assert r.status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        # Header bytes are decoded as latin-1 by the server, so send raw UTF-8 bytes
        r = client.post(
            "/webhooks/prive",
            content=b"{}",
            headers=[(HEADER.encode(), "ünï".encode("utf-8"))],
        )
        assert r.status_code == 401

    def test_signed_non_json_body(self):
        payload = b"not json"
        r = client.post("/webhooks/prive", content=payload, headers={HEADER: sign(payload)})
        assert r.status_code == 400


class TestTopicEndpoints:
    @pytest.mark.parametrize("slug", list(TOPICS))
    def test_each_topic_accepts_signed_webhook(self, slug):
        payload = b'{"id":"abc"}'
        r = client.post(
            f"/webhooks/prive/{slug}", content=payload, headers={HEADER: sign(payload)}
        )
        assert r.status_code == 200

    def test_topics_match_documented_enum(self):
        assert sorted(TOPICS.values()) == sorted(
            [
                "subscriptions/created",
                "subscriptions/line_removed",
                "subscriptions/status/updated",
                "orders/created",
                "billingAttempts/created",
                "billingAttempts/success",
                "billingAttempts/failed",
                "paymentMethod/updated",
                "subscriptionActivities/created",
                "subscription/customAttributes/updated",
            ]
        )

    def test_unknown_topic(self):
        r = client.post("/webhooks/prive/nope", content=b"{}", headers={HEADER: sign(b"{}")})
        assert r.status_code == 404

    def test_bad_signature_on_topic_path(self):
        r = client.post(
            "/webhooks/prive/billing-attempts-failed", content=b"{}", headers={HEADER: "bad"}
        )
        assert r.status_code == 401


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
