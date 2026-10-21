import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

import main
from main import app, verify_fivetran_webhook

SECRET = "test_fivetran_secret"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("FIVETRAN_WEBHOOK_SECRET", SECRET)


def sign(payload: bytes, secret: str = SECRET, upper: bool = True) -> str:
    """HMAC-SHA256 hex of the raw body. Fivetran's example uses uppercase hex."""
    digest = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return digest.upper() if upper else digest


def post(payload: bytes, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Fivetran-Signature-256"] = signature
    return client.post("/webhooks/fivetran", content=payload, headers=headers)


class TestVerify:
    payload = b'{"event":"sync_end"}'

    def test_uppercase_signature(self):
        assert verify_fivetran_webhook(self.payload, sign(self.payload), SECRET)

    def test_lowercase_signature(self):
        assert verify_fivetran_webhook(self.payload, sign(self.payload, upper=False), SECRET)

    def test_invalid_signature(self):
        assert not verify_fivetran_webhook(self.payload, "ABCDEF", SECRET)

    def test_missing_signature(self):
        assert not verify_fivetran_webhook(self.payload, None, SECRET)

    def test_wrong_secret(self):
        assert not verify_fivetran_webhook(self.payload, sign(self.payload, "other"), SECRET)

    def test_modified_body(self):
        sig = sign(self.payload)
        assert not verify_fivetran_webhook(b'{"event":"sync_start"}', sig, SECRET)


class TestEndpoint:
    def test_missing_signature(self):
        assert post(json.dumps({"event": "sync_end"}).encode()).status_code == 400

    def test_invalid_signature(self):
        response = post(json.dumps({"event": "sync_end"}).encode(), "DEADBEEF")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    @pytest.mark.parametrize(
        "body",
        [
            {"event": "sync_start", "connector_id": "c1", "sync_id": "s1"},
            {"event": "sync_end", "connector_id": "c1", "sync_id": "s1", "data": {"status": "SUCCESSFUL"}},
            {"event": "status", "connector_id": "c1", "data": {}},
            {"event": "transformation_start", "data": {}},
            {"event": "transformation_succeeded", "data": {}},
            {"event": "transformation_failed", "data": {}},
            {"event": "connection_successful", "connector_id": "c1", "data": {}},
            {"event": "connection_failure", "connector_id": "c1", "data": {}},
            {"event": "pause_connector", "connector_id": "c1"},
        ],
    )
    def test_valid_events(self, body):
        payload = json.dumps(body).encode()
        response = post(payload, sign(payload))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_lowercase_signature_accepted(self):
        payload = json.dumps({"event": "sync_end", "data": {"status": "FAILED"}}).encode()
        assert post(payload, sign(payload, upper=False)).status_code == 200

    def test_signed_non_json_body(self):
        payload = b"not json"
        assert post(payload, sign(payload)).status_code == 400

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("FIVETRAN_WEBHOOK_SECRET")
        payload = b'{"event":"sync_end"}'
        assert post(payload, sign(payload)).status_code == 500

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
