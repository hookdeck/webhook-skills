import base64
import hashlib
import json
import os
import time

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

# Generate a throwaway RSA keypair for the tests. Bridge signs with its private
# key; we verify with the matching public key set on the env var.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key_pem = (
    _private_key.public_key()
    .public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    .decode()
)

# Must be set BEFORE importing the app (get_public_key reads it at request time,
# but setting it here keeps the whole module consistent).
os.environ["BRIDGE_WEBHOOK_PUBLIC_KEY"] = _public_key_pem

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign_bridge(payload: str, timestamp: int | None = None) -> str:
    """Sign a payload the way Bridge does:

    digest = SHA256("<timestamp>.<body>")
    signature = RSA-SHA256(digest)  <-- the digest is hashed again inside sign()
    """
    if timestamp is None:
        timestamp = int(time.time() * 1000)
    digest = hashlib.sha256(f"{timestamp}.".encode() + payload.encode()).digest()
    signature = _private_key.sign(digest, padding.PKCS1v15(), hashes.SHA256())
    return f"t={timestamp},v0={base64.b64encode(signature).decode()}"


class TestBridgeWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/bridge-xyz",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"event_type": "customer.updated.status_transitioned", "event_object_id": "cust_123"})
        ts = int(time.time() * 1000)
        response = client.post(
            "/webhooks/bridge-xyz",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": f"t={ts},v0=bm90LXJlYWw=",
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        original = json.dumps({"event_type": "transfer.updated.status_transitioned", "event_object_id": "transfer_123"})
        signature = sign_bridge(original)
        tampered = json.dumps({"event_type": "transfer.updated.status_transitioned", "event_object_id": "transfer_x"})
        response = client.post(
            "/webhooks/bridge-xyz",
            content=tampered,
            headers={"Content-Type": "application/json", "X-Webhook-Signature": signature},
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        payload = json.dumps({"event_type": "customer.updated.status_transitioned", "event_object_id": "cust_123"})
        # 11 minutes ago — beyond the 10-minute tolerance.
        old_ts = int(time.time() * 1000) - 11 * 60 * 1000
        signature = sign_bridge(payload, timestamp=old_ts)
        response = client.post(
            "/webhooks/bridge-xyz",
            content=payload,
            headers={"Content-Type": "application/json", "X-Webhook-Signature": signature},
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"event_type": "customer.updated.status_transitioned", "event_object_id": "cust_valid"})
        signature = sign_bridge(payload)
        response = client.post(
            "/webhooks/bridge-xyz",
            content=payload,
            headers={"Content-Type": "application/json", "X-Webhook-Signature": signature},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_event_types(self):
        event_types = [
            "customer.created",
            "customer.updated.status_transitioned",
            "kyc_link.updated.status_transitioned",
            "transfer.created",
            "transfer.updated.status_transitioned",
            "virtual_account.activity.created",
            "unknown.event",
        ]
        for event_type in event_types:
            payload = json.dumps({"event_type": event_type, "event_object_id": "obj_123"})
            signature = sign_bridge(payload)
            response = client.post(
                "/webhooks/bridge-xyz",
                content=payload,
                headers={"Content-Type": "application/json", "X-Webhook-Signature": signature},
            )
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestVerifyHelper:
    def test_validates_correct_signature(self):
        from main import verify_bridge_signature

        payload = '{"event_type":"customer.updated.status_transitioned"}'
        signature = sign_bridge(payload)
        assert verify_bridge_signature(payload.encode(), signature, _public_key_pem) is True

    def test_rejects_malformed_header(self):
        from main import verify_bridge_signature

        assert verify_bridge_signature(b"{}", "not-a-valid-header", _public_key_pem) is False


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
