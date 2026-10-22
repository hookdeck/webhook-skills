import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["DOPPLER_WEBHOOK_SECRET"] = "test_doppler_secret"

from main import app, verify_doppler_webhook

client = TestClient(app)
SECRET = os.environ["DOPPLER_WEBHOOK_SECRET"]

DEFAULT_PAYLOAD = {
    "type": "config.secrets.update",
    "config": {"name": "dev", "root": True, "environment": "dev", "project": "backend"},
    "project": {"id": "backend", "slug": "backend", "name": "backend"},
    "workplace": {"id": "9f0c0c0d5d4e240ce26e", "name": "My Workplace"},
    "diff": {"added": ["FOO"], "removed": ["BAR"], "updated": ["BAZ"]},
}


def generate_doppler_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Doppler signature for testing (sha256=<hex> of the raw body)."""
    return "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


class TestVerifyDopplerWebhook:
    def test_valid_signature_returns_true(self):
        payload = b'{"type":"config.secrets.update"}'
        assert verify_doppler_webhook(payload, generate_doppler_signature(payload, SECRET), SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_doppler_webhook(b"{}", "sha256=invalid", SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_doppler_webhook(b"{}", None, SECRET) is False

    def test_missing_secret_returns_false(self):
        payload = b"{}"
        assert verify_doppler_webhook(payload, generate_doppler_signature(payload, SECRET), None) is False

    def test_verifies_raw_bytes_not_reserialized_json(self):
        payload = b'{ "type" : "config.secrets.update",  "diff": {} }'
        assert verify_doppler_webhook(payload, generate_doppler_signature(payload, SECRET), SECRET) is True


class TestDopplerWebhookEndpoint:
    def post(self, body: bytes, headers: dict):
        return client.post("/webhooks/doppler", content=body, headers=headers)

    def test_missing_signature_returns_401(self):
        response = self.post(json.dumps(DEFAULT_PAYLOAD).encode(), {"content-type": "application/json"})
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = self.post(
            json.dumps(DEFAULT_PAYLOAD).encode(),
            {"content-type": "application/json", "x-doppler-signature": "sha256=invalid"},
        )
        assert response.status_code == 401

    def test_valid_config_secrets_update_returns_200(self):
        body = json.dumps(DEFAULT_PAYLOAD).encode()
        response = self.post(
            body,
            {"content-type": "application/json", "x-doppler-signature": generate_doppler_signature(body, SECRET)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_custom_payload_with_other_content_type(self):
        body = b'{"text": "secrets changed"}'
        response = self.post(
            body,
            {"content-type": "text/plain", "x-doppler-signature": generate_doppler_signature(body, SECRET)},
        )
        assert response.status_code == 200

    def test_pretty_printed_json_verifies(self):
        body = json.dumps(DEFAULT_PAYLOAD, indent=4).encode()
        response = self.post(
            body,
            {"content-type": "application/json", "x-doppler-signature": generate_doppler_signature(body, SECRET)},
        )
        assert response.status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        response = self.post(
            body,
            {"content-type": "text/plain", "x-doppler-signature": generate_doppler_signature(body, SECRET)},
        )
        assert response.status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
