import base64
import json
import os
import time

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

# Configure the app's JWKS URL before importing it.
os.environ["NEON_AUTH_URL"] = "https://auth.example.test"

import main
from main import app

client = TestClient(app)

KID = "neon-test-key-1"

# One Ed25519 keypair for the whole test file, exposed as a JWKS.
_private_key = Ed25519PrivateKey.generate()
_public_bytes = _private_key.public_key().public_bytes_raw()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


JWKS = {
    "keys": [
        {
            "kty": "OKP",
            "crv": "Ed25519",
            "kid": KID,
            "use": "sig",
            "alg": "EdDSA",
            "x": _b64url_encode(_public_bytes),
        }
    ]
}


@pytest.fixture(autouse=True)
def stub_jwks(monkeypatch):
    """Serve the test JWKS instead of making a network call, and clear the cache."""
    main._key_cache.clear()
    monkeypatch.setattr(main, "_fetch_jwks", lambda: JWKS)


def sign_neon_webhook(raw_body: bytes, timestamp: int | None = None, kid: str = KID) -> dict:
    """Build Neon signature headers using the double base64url detached JWS scheme."""
    if timestamp is None:
        timestamp = int(time.time() * 1000)

    header_b64 = _b64url_encode(json.dumps({"alg": "EdDSA", "kid": kid}).encode())
    payload_b64 = _b64url_encode(raw_body)
    inner = f"{timestamp}.{payload_b64}"
    signing_input = f"{header_b64}.{_b64url_encode(inner.encode())}"
    signature_b64 = _b64url_encode(_private_key.sign(signing_input.encode()))

    return {
        "X-Neon-Signature": f"{header_b64}..{signature_b64}",
        "X-Neon-Signature-Kid": kid,
        "X-Neon-Timestamp": str(timestamp),
    }


class TestNeonWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/neon",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing Neon signature headers" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"hello": "world"})
        response = client.post(
            "/webhooks/neon",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Neon-Signature": "eyJhbGciOiJFZERTQSJ9..bm90LWEtc2ln",
                "X-Neon-Signature-Kid": KID,
                "X-Neon-Timestamp": str(int(time.time() * 1000)),
                "X-Neon-Event-Type": "user.created",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"user": {"id": "u_1"}})
        headers = sign_neon_webhook(original.encode())
        tampered = json.dumps({"user": {"id": "u_admin"}})

        response = client.post(
            "/webhooks/neon",
            content=tampered,
            headers={**headers, "X-Neon-Event-Type": "user.created"},
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"user": {"id": "u_1"}})
        old_ts = int(time.time() * 1000) - 10 * 60 * 1000  # 10 minutes ago
        headers = sign_neon_webhook(payload.encode(), timestamp=old_ts)

        response = client.post(
            "/webhooks/neon",
            content=payload,
            headers={**headers, "X-Neon-Event-Type": "user.created"},
        )
        assert response.status_code == 400
        assert "Timestamp too old" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"user": {"id": "u_valid"}})
        headers = sign_neon_webhook(payload.encode())

        response = client.post(
            "/webhooks/neon",
            content=payload,
            headers={
                **headers,
                "X-Neon-Event-Type": "user.created",
                "X-Neon-Event-Id": "evt_123",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_before_create_returns_allowed(self):
        payload = json.dumps({"event_type": "user.before_create"})
        headers = sign_neon_webhook(payload.encode())

        response = client.post(
            "/webhooks/neon",
            content=payload,
            headers={**headers, "X-Neon-Event-Type": "user.before_create"},
        )
        assert response.status_code == 200
        assert response.json() == {"allowed": True}

    def test_handles_all_event_types(self):
        event_types = [
            "send.otp",
            "send.magic_link",
            "user.before_create",
            "user.created",
            "phone_number.verified",
            "organization.invitation.created",
            "organization.invitation.accepted",
            "unknown.event",
        ]

        for event_type in event_types:
            payload = json.dumps({"event_type": event_type})
            headers = sign_neon_webhook(payload.encode())

            response = client.post(
                "/webhooks/neon",
                content=payload,
                headers={**headers, "X-Neon-Event-Type": event_type},
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
