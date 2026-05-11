import os
import hmac
import hashlib
import base64
import json
import time
import pytest
from fastapi.testclient import TestClient

# Test secret: whsec_ + base64("test_secret_key_for_testing")
os.environ["ANTHROPIC_WEBHOOK_SIGNING_KEY"] = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n"

from main import app

ENDPOINT = "/webhooks/claude-managed-agents"


def generate_signature(payload: bytes, secret: str, webhook_id: str, webhook_timestamp: str) -> str:
    """Generate a valid Standard Webhooks signature."""
    secret_key = secret[6:] if secret.startswith("whsec_") else secret
    secret_bytes = base64.b64decode(secret_key)

    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    return f"v1,{signature}"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def secret():
    return os.environ["ANTHROPIC_WEBHOOK_SIGNING_KEY"]


class TestClaudeManagedAgentsWebhook:
    def test_missing_signature_headers(self, client):
        response = client.post(
            ENDPOINT,
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_malformed_signature_header(self, client):
        payload = json.dumps(
            {"type": "event", "id": "event_test_123", "data": {"type": "session.status_idled", "id": "sesn_ABC123"}}
        )

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "not_in_v1_format",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_expired_timestamp(self, client, secret):
        payload = json.dumps(
            {"type": "event", "id": "event_test_123", "data": {"type": "session.status_idled", "id": "sesn_ABC123"}}
        )

        webhook_id = "msg_test123"
        old_timestamp = str(int(time.time()) - 400)
        signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, old_timestamp)

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": old_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_forged_signature(self, client):
        payload = json.dumps(
            {"type": "event", "id": "event_test_123", "data": {"type": "session.status_idled", "id": "sesn_ABC123"}}
        )

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "v1,forged_signature_value",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_tampered_payload(self, client, secret):
        original = json.dumps(
            {"type": "event", "id": "event_test_123", "data": {"type": "session.status_idled", "id": "sesn_ORIGINAL"}}
        )

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(original.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        tampered = json.dumps(
            {"type": "event", "id": "event_test_123", "data": {"type": "session.status_idled", "id": "sesn_TAMPERED"}}
        )

        response = client.post(
            ENDPOINT,
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_valid_signature(self, client, secret):
        payload = json.dumps(
            {
                "type": "event",
                "id": "event_test_valid",
                "created_at": "2026-03-18T14:05:22Z",
                "data": {
                    "type": "session.status_idled",
                    "id": "sesn_01XYZ",
                    "organization_id": "8a3d2f1e-aaaa-bbbb-cccc-ddddeeeeffff",
                    "workspace_id": "c7b0e4d9-0000-1111-2222-333344445555",
                },
            }
        )

        webhook_id = "msg_test123"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        [
            "session.status_run_started",
            "session.status_idled",
            "session.status_rescheduled",
            "session.status_terminated",
            "session.thread_created",
            "session.thread_idled",
            "session.thread_terminated",
            "session.outcome_evaluation_ended",
            "vault.created",
            "vault.archived",
            "vault.deleted",
            "vault_credential.created",
            "vault_credential.archived",
            "vault_credential.deleted",
            "vault_credential.refresh_failed",
        ],
    )
    def test_handle_event_types(self, client, secret, event_type):
        payload = json.dumps(
            {
                "type": "event",
                "id": f"event_test_{event_type}",
                "data": {"type": event_type, "id": "resource_123"},
            }
        )

        webhook_id = f"msg_{event_type}"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unrecognised_event_type(self, client, secret):
        payload = json.dumps(
            {"type": "event", "id": "event_test_unknown", "data": {"type": "session.status_future_event", "id": "sesn_X"}}
        )

        webhook_id = "msg_unknown"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_case_insensitive_headers(self, client, secret):
        payload = json.dumps(
            {"type": "event", "id": "event_test_case", "data": {"type": "session.status_idled", "id": "sesn_ABC123"}}
        )

        webhook_id = "msg_case"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Webhook-Id": webhook_id,
                "WEBHOOK-TIMESTAMP": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_multi_signature_header_rotation(self, client, secret):
        payload = json.dumps(
            {"type": "event", "id": "event_test_rotation", "data": {"type": "session.status_idled", "id": "sesn_ABC123"}}
        )

        webhook_id = "msg_rotation"
        webhook_timestamp = str(int(time.time()))
        valid_signature = generate_signature(payload.encode("utf-8"), secret, webhook_id, webhook_timestamp)
        # First sig is bogus (e.g. old key), second sig is valid — should still accept
        multi_signature = f"v1,bogus_signature {valid_signature}"

        response = client.post(
            ENDPOINT,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": multi_signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_malformed_json_payload(self, client, secret):
        malformed = "{invalid json"

        webhook_id = "msg_malformed"
        webhook_timestamp = str(int(time.time()))
        signature = generate_signature(malformed.encode("utf-8"), secret, webhook_id, webhook_timestamp)

        response = client.post(
            ENDPOINT,
            content=malformed,
            headers={
                "Content-Type": "application/json",
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": signature,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    def test_no_signing_key_configured(self, client):
        original = os.environ.get("ANTHROPIC_WEBHOOK_SIGNING_KEY")
        del os.environ["ANTHROPIC_WEBHOOK_SIGNING_KEY"]

        try:
            response = client.post(
                ENDPOINT,
                content="{}",
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 500
            assert response.json()["detail"] == "Webhook signing key not configured"
        finally:
            if original:
                os.environ["ANTHROPIC_WEBHOOK_SIGNING_KEY"] = original


class TestHealthCheck:
    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
