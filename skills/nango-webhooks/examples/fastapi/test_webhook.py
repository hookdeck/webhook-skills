import hashlib
import hmac
import json
import os

import pytest

# Nango signing keys are UUID-style strings used as-is (UTF-8) as the HMAC key
SIGNING_KEY = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f"
API_KEY = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"  # different from the signing key
os.environ["NANGO_WEBHOOK_SIGNING_KEY"] = SIGNING_KEY

from fastapi.testclient import TestClient  # noqa: E402

from main import app, is_full_sync, verify_nango_signature  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, key: str = SIGNING_KEY) -> str:
    """Same algorithm as Nango: hex HMAC-SHA256 of the raw body."""
    return hmac.new(key.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def post(payload: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/nango",
        content=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


def signed_post(body):
    payload = body if isinstance(body, bytes) else json.dumps(body).encode()
    return post(payload, {"X-Nango-Hmac-Sha256": sign(payload)})


TAGS = {
    "end_user_id": "user-123",
    "end_user_email": "user@example.com",
    "organization_id": "org-456",
}

AUTH_CREATION = {
    "from": "nango",
    "type": "auth",
    "operation": "creation",
    "connectionId": "conn-abc",
    "authMode": "OAUTH2",
    "providerConfigKey": "hubspot",
    "provider": "hubspot",
    "environment": "DEV",
    "success": True,
    "tags": TAGS,
}

SYNC_SUCCESS = {
    "from": "nango",
    "type": "sync",
    "connectionId": "conn-abc",
    "providerConfigKey": "hubspot",
    "syncName": "contacts",
    "syncVariant": "base",
    "model": "Contact",
    "syncType": "INCREMENTAL",
    "success": True,
    "modifiedAfter": "2026-10-21T09:00:00.000Z",
    "responseResults": {"added": 3, "updated": 1, "deleted": 0},
    "checkpoints": {"from": None, "to": {"cursor": "abc"}},
}

SYNC_FAILURE = {
    "from": "nango",
    "type": "sync",
    "connectionId": "conn-abc",
    "providerConfigKey": "hubspot",
    "syncName": "contacts",
    "syncVariant": "base",
    "model": "Contact",
    "syncType": "INCREMENTAL",
    "success": False,
    "error": {"type": "script_error", "description": "boom"},
    "startedAt": "2026-10-21T09:00:00.000Z",
    "failedAt": "2026-10-21T09:00:05.000Z",
}

FORWARD = {
    "from": "hubspot",
    "providerConfigKey": "hubspot",
    "type": "forward",
    "connectionId": "conn-abc",
    "payload": [{"subscriptionType": "contact.creation", "objectId": 123}],
}


class TestVerifyNangoSignature:
    def test_valid(self):
        payload = b'{"type":"auth"}'
        assert verify_nango_signature(payload, sign(payload), SIGNING_KEY)

    def test_uppercase_hex_accepted(self):
        payload = b'{"type":"auth"}'
        assert verify_nango_signature(payload, sign(payload).upper(), SIGNING_KEY)

    def test_missing(self):
        assert not verify_nango_signature(b"{}", None, SIGNING_KEY)
        assert not verify_nango_signature(b"{}", "", SIGNING_KEY)

    def test_wrong_key(self):
        payload = b"{}"
        assert not verify_nango_signature(payload, sign(payload, API_KEY), SIGNING_KEY)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = signed_post(AUTH_CREATION)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        res = post(json.dumps(AUTH_CREATION).encode())
        assert res.status_code == 400
        assert "Missing" in res.json()["detail"]

    def test_rejects_invalid_signature(self):
        res = post(json.dumps(AUTH_CREATION).encode(), {"X-Nango-Hmac-Sha256": "a" * 64})
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_wrong_length_signature(self):
        res = post(json.dumps(AUTH_CREATION).encode(), {"X-Nango-Hmac-Sha256": "deadbeef"})
        assert res.status_code == 400

    def test_rejects_tampered_body(self):
        payload = json.dumps(AUTH_CREATION).encode()
        tampered = payload.replace(b"conn-abc", b"conn-evil")
        res = post(tampered, {"X-Nango-Hmac-Sha256": sign(payload)})
        assert res.status_code == 400

    def test_rejects_api_key_signature(self):
        payload = json.dumps(AUTH_CREATION).encode()
        res = post(payload, {"X-Nango-Hmac-Sha256": sign(payload, API_KEY)})
        assert res.status_code == 400

    def test_rejects_legacy_header_only(self):
        payload = json.dumps(AUTH_CREATION).encode()
        legacy = hashlib.sha256(SIGNING_KEY.encode() + payload).hexdigest()
        res = post(payload, {"X-Nango-Signature": legacy})
        assert res.status_code == 400

    def test_raw_body_byte_for_byte(self):
        payload = json.dumps(AUTH_CREATION, indent=2).encode()
        assert post(payload, {"X-Nango-Hmac-Sha256": sign(payload)}).status_code == 200

        reserialised = json.dumps(AUTH_CREATION).encode()
        assert post(reserialised, {"X-Nango-Hmac-Sha256": sign(payload)}).status_code == 400

    def test_signed_non_json_body(self):
        res = signed_post(b"not json")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON payload"


class TestWebhookTypes:
    def test_auth_creation(self, caplog):
        caplog.set_level("INFO")
        assert signed_post(AUTH_CREATION).status_code == 200
        assert "Connection created: conn-abc" in caplog.text

    @pytest.mark.parametrize("operation", ["override", "deletion"])
    def test_auth_operations(self, operation):
        assert signed_post({**AUTH_CREATION, "operation": operation}).status_code == 200

    def test_auth_refresh_failure(self, caplog):
        caplog.set_level("INFO")
        body = {
            **AUTH_CREATION,
            "operation": "refresh",
            "success": False,
            "error": {"type": "refresh_token_external_error", "description": "invalid_grant"},
        }
        assert signed_post(body).status_code == 200
        assert "Token refresh failed for conn-abc" in caplog.text

    def test_auth_refresh_recovery(self, caplog):
        caplog.set_level("INFO")
        assert signed_post({**AUTH_CREATION, "operation": "refresh", "success": True}).status_code == 200
        assert "recovered" in caplog.text

    def test_sync_success(self, caplog):
        caplog.set_level("INFO")
        assert signed_post(SYNC_SUCCESS).status_code == 200
        assert "Sync contacts (Contact) succeeded" in caplog.text

    def test_sync_failure(self, caplog):
        caplog.set_level("INFO")
        assert signed_post(SYNC_FAILURE).status_code == 200
        assert "Sync contacts failed" in caplog.text

    def test_full_vs_incremental(self):
        assert is_full_sync(SYNC_SUCCESS)
        assert is_full_sync({k: v for k, v in SYNC_SUCCESS.items() if k != "checkpoints"})
        assert is_full_sync({**SYNC_SUCCESS, "checkpoints": None})
        assert not is_full_sync({**SYNC_SUCCESS, "checkpoints": {"from": {"cursor": "a"}, "to": {"cursor": "b"}}})

    def test_forward(self, caplog):
        caplog.set_level("INFO")
        assert signed_post(FORWARD).status_code == 200
        assert "Forwarded hubspot webhook for connection conn-abc" in caplog.text

    def test_unverified_forward(self, caplog):
        caplog.set_level("INFO")
        assert signed_post({**FORWARD, "unverified": True}).status_code == 200
        assert "Unverified forward from hubspot" in caplog.text

    def test_async_action(self):
        body = {
            "from": "nango",
            "type": "async_action",
            "connectionId": "conn-abc",
            "providerConfigKey": "hubspot",
            "payload": {"id": "action-1", "statusUrl": "/action/action-1"},
        }
        assert signed_post(body).status_code == 200

    def test_unknown_type(self):
        assert signed_post({"from": "nango", "type": "some_future_type"}).status_code == 200

    def test_unattributed_raw_forward(self):
        assert signed_post([{"subscriptionType": "contact.creation", "objectId": 1}]).status_code == 200


def test_missing_signing_key(monkeypatch):
    monkeypatch.delenv("NANGO_WEBHOOK_SIGNING_KEY")
    assert signed_post(AUTH_CREATION).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
