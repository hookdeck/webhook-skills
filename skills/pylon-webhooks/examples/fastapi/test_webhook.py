import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PYLON_WEBHOOK_SECRET"] = "test_pylon_secret"

from main import app, verify_pylon_webhook  # noqa: E402

client = TestClient(app)

SECRET = os.environ["PYLON_WEBHOOK_SECRET"]
ISSUE_PAYLOAD = json.dumps(
    {
        "issue_id": "b7c1a1d2-0000-4000-8000-000000000001",
        "number": "42",
        "title": "Login is broken",
        "tags": "bug,urgent",
        "requester_email": "customer@example.com",
    }
)


def sign_pylon(payload: bytes, timestamp: str, secret: str) -> str:
    """Sign the way Pylon signs X-Pylon-Signature-V2: hex HMAC-SHA256 of
    `timestamp + "." + body`, keyed with the secret string."""
    signed = timestamp.encode("utf-8") + b"." + payload
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def now_timestamp() -> str:
    return str(int(time.time()))


class TestVerifyPylonWebhook:
    timestamp = "1731150000"
    now = 1731150010
    body = ISSUE_PAYLOAD.encode("utf-8")

    def test_valid_signature(self):
        sig = sign_pylon(self.body, self.timestamp, SECRET)
        assert verify_pylon_webhook(self.body, self.timestamp, sig, SECRET, self.now)

    def test_wrong_secret(self):
        sig = sign_pylon(self.body, self.timestamp, "wrong_secret")
        assert not verify_pylon_webhook(self.body, self.timestamp, sig, SECRET, self.now)

    def test_changed_timestamp(self):
        sig = sign_pylon(self.body, self.timestamp, SECRET)
        assert not verify_pylon_webhook(self.body, "1731150001", sig, SECRET, self.now)

    def test_legacy_body_only_signature(self):
        legacy = hmac.new(SECRET.encode("utf-8"), self.body, hashlib.sha256).hexdigest()
        assert not verify_pylon_webhook(self.body, self.timestamp, legacy, SECRET, self.now)

    def test_old_timestamp(self):
        sig = sign_pylon(self.body, self.timestamp, SECRET)
        assert not verify_pylon_webhook(self.body, self.timestamp, sig, SECRET, self.now + 301)

    def test_missing_headers(self):
        sig = sign_pylon(self.body, self.timestamp, SECRET)
        assert not verify_pylon_webhook(self.body, None, sig, SECRET, self.now)
        assert not verify_pylon_webhook(self.body, self.timestamp, None, SECRET, self.now)


class TestPylonWebhookEndpoint:
    def test_missing_signature(self):
        response = client.post(
            "/webhooks/pylon",
            content=ISSUE_PAYLOAD,
            headers={"Content-Type": "application/json", "X-Pylon-Timestamp": now_timestamp()},
        )
        assert response.status_code == 400

    def test_tampered_payload(self):
        timestamp = now_timestamp()
        sig = sign_pylon(ISSUE_PAYLOAD.encode("utf-8"), timestamp, SECRET)
        response = client.post(
            "/webhooks/pylon",
            content=ISSUE_PAYLOAD.replace("Login is broken", "Nothing to see"),
            headers={
                "Content-Type": "application/json",
                "X-Pylon-Timestamp": timestamp,
                "X-Pylon-Signature-V2": sig,
            },
        )
        assert response.status_code == 400

    def test_signed_delivery(self):
        timestamp = now_timestamp()
        sig = sign_pylon(ISSUE_PAYLOAD.encode("utf-8"), timestamp, SECRET)
        response = client.post(
            "/webhooks/pylon",
            content=ISSUE_PAYLOAD,
            headers={
                "Content-Type": "application/json",
                "X-Pylon-Timestamp": timestamp,
                "X-Pylon-Signature-V2": sig,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_signed_ping(self):
        ping = '{"data":{"type":"ping"}}'
        timestamp = now_timestamp()
        response = client.post(
            "/webhooks/pylon",
            content=ping,
            headers={
                "Content-Type": "application/json",
                "X-Pylon-Timestamp": timestamp,
                "X-Pylon-Signature-V2": sign_pylon(ping.encode("utf-8"), timestamp, SECRET),
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
