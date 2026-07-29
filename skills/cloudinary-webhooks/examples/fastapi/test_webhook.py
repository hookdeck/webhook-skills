import json
import os
import time

# Set the account API secret before importing the app (the SDK reads it at config time)
os.environ["CLOUDINARY_API_SECRET"] = "test_api_secret_abcd1234"
os.environ["CLOUDINARY_SIGNATURE_ALGORITHM"] = "sha1"

import cloudinary
from cloudinary.utils import compute_hex_hash
from fastapi.testclient import TestClient

from main import app, verify_cloudinary_signature, KNOWN_EVENT_TYPES

client = TestClient(app)

API_SECRET = os.environ["CLOUDINARY_API_SECRET"]


def payload(**overrides) -> str:
    body = {
        "notification_type": "upload",
        "public_id": "sample",
        "version": 1690000000,
        "resource_type": "image",
    }
    body.update(overrides)
    return json.dumps(body)


def sign(raw_body: str, timestamp: int, algorithm: str = "sha1") -> str:
    """Sign a raw body exactly like Cloudinary does: hex digest of
    <algorithm>(rawBody + timestamp + api_secret)."""
    return compute_hex_hash("{}{}{}".format(raw_body, timestamp, API_SECRET), algorithm)


def now() -> int:
    return int(time.time())


class TestVerifyCloudinarySignature:
    def test_valid_sha1_signature(self):
        ts = now()
        body = payload()
        assert verify_cloudinary_signature(body, str(ts), sign(body, ts, "sha1")) is True

    def test_wrong_signature(self):
        assert verify_cloudinary_signature(payload(), str(now()), "deadbeef") is False

    def test_missing_signature(self):
        assert verify_cloudinary_signature(payload(), str(now()), "") is False

    def test_tampered_body(self):
        ts = now()
        signature = sign(payload(), ts, "sha1")
        tampered = payload(public_id="attacker")
        assert verify_cloudinary_signature(tampered, str(ts), signature) is False


class TestCloudinaryWebhook:
    def test_missing_headers_returns_400(self):
        response = client.post(
            "/webhooks/cloudinary",
            content=payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_wrong_signature_returns_401(self):
        ts = now()
        response = client.post(
            "/webhooks/cloudinary",
            content=payload(),
            headers={
                "Content-Type": "application/json",
                "x-cld-timestamp": str(ts),
                "x-cld-signature": "deadbeef",
            },
        )
        assert response.status_code == 401

    def test_wrong_secret_returns_401(self):
        ts = now()
        body = payload()
        wrong_sig = compute_hex_hash("{}{}{}".format(body, ts, "the_wrong_secret"), "sha1")
        response = client.post(
            "/webhooks/cloudinary",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-cld-timestamp": str(ts),
                "x-cld-signature": wrong_sig,
            },
        )
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        ts = now()
        signature = sign(payload(), ts, "sha1")
        response = client.post(
            "/webhooks/cloudinary",
            content=payload(public_id="attacker"),
            headers={
                "Content-Type": "application/json",
                "x-cld-timestamp": str(ts),
                "x-cld-signature": signature,
            },
        )
        assert response.status_code == 401

    def test_valid_sha1_returns_200(self):
        ts = now()
        body = payload()
        response = client.post(
            "/webhooks/cloudinary",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-cld-timestamp": str(ts),
                "x-cld-signature": sign(body, ts, "sha1"),
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_sha256_returns_200(self):
        # Cloudinary uses ONE algorithm per account. Switch the SDK to sha256 to
        # model an account with sha256 signatures enabled, then restore sha1.
        cloudinary.config(signature_algorithm="sha256")
        try:
            ts = now()
            body = payload()
            response = client.post(
                "/webhooks/cloudinary",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "x-cld-timestamp": str(ts),
                    "x-cld-signature": sign(body, ts, "sha256"),
                },
            )
            assert response.status_code == 200
        finally:
            cloudinary.config(signature_algorithm="sha1")

    def test_dispatches_every_known_type(self):
        for notification_type in KNOWN_EVENT_TYPES:
            ts = now()
            body = payload(notification_type=notification_type)
            response = client.post(
                "/webhooks/cloudinary",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "x-cld-timestamp": str(ts),
                    "x-cld-signature": sign(body, ts, "sha1"),
                },
            )
            assert response.status_code == 200, f"Failed for type: {notification_type}"

    def test_unknown_type_acknowledged_with_200(self):
        ts = now()
        body = payload(notification_type="some_future_event")
        response = client.post(
            "/webhooks/cloudinary",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-cld-timestamp": str(ts),
                "x-cld-signature": sign(body, ts, "sha1"),
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
