import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["NOTION_VERIFICATION_TOKEN"] = "secret_test_verification_token"

from main import app, verify_notion_signature  # noqa: E402

client = TestClient(app)
TOKEN = os.environ["NOTION_VERIFICATION_TOKEN"]


def generate_notion_signature(raw_body: bytes, token: str) -> str:
    """Mirror the provider format: sha256=<hex(HMAC-SHA256(token, body))>."""
    digest = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class TestVerifyNotionSignature:
    def test_valid_signature_returns_true(self):
        body = b'{"type":"page.content_updated"}'
        sig = generate_notion_signature(body, TOKEN)
        assert verify_notion_signature(body, sig, TOKEN) is True

    def test_invalid_signature_returns_false(self):
        body = b'{"type":"page.content_updated"}'
        assert verify_notion_signature(body, "sha256=deadbeef", TOKEN) is False

    def test_missing_signature_returns_false(self):
        body = b'{"type":"page.content_updated"}'
        assert verify_notion_signature(body, None, TOKEN) is False

    def test_missing_token_returns_false(self):
        body = b'{"type":"page.content_updated"}'
        sig = generate_notion_signature(body, TOKEN)
        assert verify_notion_signature(body, sig, None) is False

    def test_wrong_token_returns_false(self):
        body = b'{"type":"page.content_updated"}'
        sig = generate_notion_signature(body, TOKEN)
        assert verify_notion_signature(body, sig, "secret_other") is False

    def test_tampered_body_returns_false(self):
        original = b'{"type":"page.content_updated","id":1}'
        sig = generate_notion_signature(original, TOKEN)
        tampered = b'{"type":"page.content_updated","id":2}'
        assert verify_notion_signature(tampered, sig, TOKEN) is False


class TestHandshake:
    def test_handshake_returns_200(self):
        body = json.dumps({"verification_token": "secret_handshake_xyz"})
        response = client.post(
            "/webhooks/notion",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_no_signature_no_token_returns_400(self):
        response = client.post(
            "/webhooks/notion",
            content='{"hello":"world"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400


class TestSignedDeliveries:
    def test_invalid_signature_returns_401(self):
        body = json.dumps(
            {
                "id": "evt_1",
                "type": "page.content_updated",
                "entity": {"id": "page_1"},
            }
        )
        response = client.post(
            "/webhooks/notion",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Notion-Signature": "sha256=deadbeef",
            },
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        original = json.dumps(
            {
                "id": "evt_1",
                "type": "page.content_updated",
                "entity": {"id": "page_1"},
            }
        )
        sig = generate_notion_signature(original.encode("utf-8"), TOKEN)
        tampered = json.dumps(
            {
                "id": "evt_1",
                "type": "page.content_updated",
                "entity": {"id": "page_tampered"},
            }
        )
        response = client.post(
            "/webhooks/notion",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Notion-Signature": sig,
            },
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        body = json.dumps(
            {
                "id": "evt_valid",
                "type": "page.content_updated",
                "entity": {"id": "page_valid"},
            }
        )
        sig = generate_notion_signature(body.encode("utf-8"), TOKEN)
        response = client.post(
            "/webhooks/notion",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Notion-Signature": sig,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        [
            "page.content_updated",
            "page.properties_updated",
            "page.created",
            "page.deleted",
            "page.locked",
            "page.moved",
            "comment.created",
            "data_source.schema_updated",
            "unknown.event.type",
        ],
    )
    def test_handles_event_types(self, event_type):
        body = json.dumps(
            {
                "id": f"evt_{event_type.replace('.', '_')}",
                "type": event_type,
                "entity": {"id": "entity_1"},
            }
        )
        sig = generate_notion_signature(body.encode("utf-8"), TOKEN)
        response = client.post(
            "/webhooks/notion",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Notion-Signature": sig,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
