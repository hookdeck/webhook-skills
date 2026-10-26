import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

os.environ["PLANE_WEBHOOK_SECRET"] = "plane_wh_test_secret_key"

from main import app, verify_plane_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["PLANE_WEBHOOK_SECRET"]


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Plane's X-Plane-Signature is the bare hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


# Payloads follow the examples in Plane's webhook docs
COMMENT_CREATED = {
    "version": "v2",
    "delivery_id": "01ab9316-f978-4449-bad6-dce958be8454",
    "event_id": "0afa042d-92a9-4326-bdca-5ff5490dbf09",
    "entity_id": "088a83b9-a53f-4dda-b2bc-c860cf455997",
    "entity_type": "issue",
    "event": "workitem.comment.created",
    "webhook_id": "285f087b-e1e0-4f90-b9f4-0b720acfac04",
    "workspace_id": "d250cd44-fa71-42c2-b2b5-3c73227288fc",
    "data": {
        "id": "088a83b9-a53f-4dda-b2bc-c860cf455997",
        "name": "Webhook Test Work Item 2",
        "comment": {
            "id": "4797f841-c731-4e55-971f-d9cfe1938dfb",
            "access": "INTERNAL",
            "actor_id": "88fc36c8-73b0-4547-81c7-96b70f61835e",
            "issue_id": "088a83b9-a53f-4dda-b2bc-c860cf455997",
            "edited_at": None,
            "comment_stripped": "Webhook Test Comment",
        },
    },
    "previous_attributes": {},
}

LINK_CREATED = {
    "version": "v2",
    "delivery_id": "616d98fe-35a7-4431-a233-db40936c8339",
    "event_id": "7b3c1e2a-8f94-4b12-a781-2c5e9d4f6a03",
    "entity_id": "8661bdfa-098f-434d-8e44-b1f32de62406",
    "entity_type": "issue_link",
    "event": "workitem.link.created",
    "webhook_id": "285f087b-e1e0-4f90-b9f4-0b720acfac04",
    "workspace_id": "d250cd44-fa71-42c2-b2b5-3c73227288fc",
    "data": {
        "id": "a6f8e562-49d2-4c19-bc4b-2bcb9d917da1",
        "url": "http://google.com",
        "title": "",
        "issue_id": "8661bdfa-098f-434d-8e44-b1f32de62406",
    },
    "previous_attributes": {},
}


def send(body, signature: str | None = None, content_type: str = "application/json",
         sign_body: bool = True):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    headers = {
        "Content-Type": content_type,
        "X-Plane-Delivery": "test-delivery-id",
    }
    if signature is None and sign_body:
        signature = sign(raw)
    if signature is not None:
        headers["X-Plane-Signature"] = signature
    return client.post("/webhooks/plane", content=raw, headers=headers)


class TestVerifyPlaneWebhook:
    payload = b'{"event":"project.updated"}'

    def test_valid_signature(self):
        assert verify_plane_webhook(self.payload, sign(self.payload), SECRET) is True

    def test_uppercase_hex(self):
        assert verify_plane_webhook(self.payload, sign(self.payload).upper(), SECRET) is True

    @pytest.mark.parametrize("signature", [None, ""])
    def test_missing_or_empty_signature(self, signature):
        assert verify_plane_webhook(self.payload, signature, SECRET) is False

    def test_wrong_length(self):
        good = sign(self.payload)
        assert verify_plane_webhook(self.payload, good[:62], SECRET) is False
        assert verify_plane_webhook(self.payload, good + "00", SECRET) is False

    def test_not_all_hex(self):
        assert verify_plane_webhook(self.payload, "z" * 64, SECRET) is False

    def test_non_ascii_digits_rejected(self):
        assert verify_plane_webhook(self.payload, "٣" * 64, SECRET) is False

    def test_prefixed_signature(self):
        assert verify_plane_webhook(self.payload, f"sha256={sign(self.payload)}", SECRET) is False

    def test_no_secret(self):
        assert verify_plane_webhook(self.payload, sign(self.payload), "") is False
        assert verify_plane_webhook(self.payload, sign(self.payload), None) is False

    def test_secret_used_as_utf8_bytes(self):
        secret = "abcdef0123456789abcdef0123456789"
        assert verify_plane_webhook(self.payload, sign(self.payload, secret), secret) is True


class TestPlaneWebhookEndpoint:
    def test_missing_signature(self):
        assert send(COMMENT_CREATED, sign_body=False).status_code == 401

    def test_empty_signature(self):
        assert send(COMMENT_CREATED, signature="").status_code == 401

    def test_malformed_signature(self):
        assert send(COMMENT_CREATED, signature="not-a-signature").status_code == 401

    def test_wrong_secret(self):
        raw = json.dumps(COMMENT_CREATED).encode()
        assert send(raw, signature=sign(raw, "plane_wh_other")).status_code == 401

    def test_body_changed_after_signing(self):
        signature = sign(json.dumps(COMMENT_CREATED).encode())
        changed = {**COMMENT_CREATED, "entity_id": "changed"}
        assert send(changed, signature=signature).status_code == 401

    def test_valid_comment_created(self):
        response = send(COMMENT_CREATED)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_exact_bytes_including_whitespace(self):
        raw = json.dumps(COMMENT_CREATED, indent=2).encode()
        assert send(raw).status_code == 200

    def test_non_json_content_type(self):
        assert send(COMMENT_CREATED, content_type="text/plain").status_code == 200

    def test_event_without_handler(self):
        assert send(LINK_CREATED).status_code == 200

    def test_enum_label_event(self):
        body = {**COMMENT_CREATED, "event": "WebhookScope.ScopeChoices.WORK_ITEM_UPDATED"}
        assert send(body).status_code == 200

    def test_signed_body_not_json(self):
        assert send(b"not json").status_code == 400

    @pytest.mark.parametrize("raw", [b"[]", b"null", b"42"])
    def test_signed_json_not_object(self, raw):
        assert send(raw).status_code == 400

    @pytest.mark.parametrize("body", [{"version": "v2"}, {"event": 42}])
    def test_event_missing_or_not_string(self, body):
        assert send(body).status_code == 400

    @pytest.mark.parametrize("body", [
        {**COMMENT_CREATED, "data": "oops"},
        {**COMMENT_CREATED, "data": []},
        {**COMMENT_CREATED, "data": {"name": 7, "comment": "oops"}},
        {**COMMENT_CREATED, "data": {"comment": {"comment_stripped": {"x": 1}}}},
        {**COMMENT_CREATED, "event": "workitem.updated", "previous_attributes": "oops"},
    ])
    def test_wrong_typed_nested_fields(self, body):
        assert send(body).status_code == 200

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("PLANE_WEBHOOK_SECRET")
        assert send(COMMENT_CREATED).status_code == 500

    def test_get_not_allowed(self):
        assert client.get("/webhooks/plane").status_code == 405


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
