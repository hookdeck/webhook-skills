import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# SavvyCal secrets are opaque strings; any value works for tests
SECRET = "test_savvycal_webhook_secret"
os.environ["SAVVYCAL_WEBHOOK_SECRET"] = SECRET

from main import app, verify_savvycal_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Real SavvyCal algorithm: HMAC-SHA256 over the raw body, hex encoded."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_body(event_type: str = "event.created") -> bytes:
    return json.dumps({"type": event_type, "id": "payload_TEST123"}).encode()


class TestVerifySignature:
    def test_bare_lowercase_hex(self):
        body = make_body()
        assert verify_savvycal_signature(body, sign(body), SECRET)

    def test_bare_uppercase_hex(self):
        body = make_body()
        assert verify_savvycal_signature(body, sign(body).upper(), SECRET)

    def test_sha256_prefix_uppercase_hex(self):
        body = make_body()
        assert verify_savvycal_signature(body, f"sha256={sign(body).upper()}", SECRET)

    def test_uppercase_prefix_lowercase_hex(self):
        body = make_body()
        assert verify_savvycal_signature(body, f"SHA256={sign(body)}", SECRET)

    def test_wrong_secret(self):
        body = make_body()
        assert not verify_savvycal_signature(body, sign(body, "other"), SECRET)

    def test_tampered_body(self):
        body = make_body()
        assert not verify_savvycal_signature(body + b" ", sign(body), SECRET)

    @pytest.mark.parametrize("bad", ["", "abc123", "zz" * 32])
    def test_malformed_signature(self, bad):
        assert not verify_savvycal_signature(make_body(), bad, SECRET)


class TestWebhookEndpoint:
    def test_valid_signature_with_prefix(self):
        body = make_body()
        res = client.post(
            "/webhooks/savvycal",
            content=body,
            headers={
                "content-type": "application/json",
                "x-savvycal-signature": f"sha256={sign(body).upper()}",
            },
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        body = make_body()
        res = client.post(
            "/webhooks/savvycal",
            content=body,
            headers={"content-type": "text/plain", "x-savvycal-signature": sign(body)},
        )
        assert res.status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "event.created",
            "event.rescheduled",
            "event.canceled",
            "event.changed",
            "event.checkout.completed",
            "event.checkout.pending",
        ],
    )
    def test_handles_event_types(self, event_type):
        body = make_body(event_type)
        res = client.post(
            "/webhooks/savvycal",
            content=body,
            headers={"x-savvycal-signature": sign(body)},
        )
        assert res.status_code == 200

    def test_invalid_signature(self):
        body = make_body()
        res = client.post(
            "/webhooks/savvycal",
            content=body,
            headers={"x-savvycal-signature": sign(body, "wrong")},
        )
        assert res.status_code == 400

    def test_missing_signature(self):
        res = client.post("/webhooks/savvycal", content=make_body())
        assert res.status_code == 400

    def test_signed_invalid_json(self):
        body = b"not json"
        res = client.post(
            "/webhooks/savvycal",
            content=body,
            headers={"x-savvycal-signature": sign(body)},
        )
        assert res.status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
