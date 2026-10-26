import os
import json
import hmac
import hashlib
import base64

import pytest
from fastapi.testclient import TestClient

SECRET = "ahywqn676nwh8"
os.environ["AUTOTASK_WEBHOOK_SECRET"] = SECRET

from main import app, verify_autotask_webhook  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Generate a real Autotask signature: sha1=base64(HMAC_SHA1(secret, body))."""
    digest = hmac.new(secret.encode(), body, hashlib.sha1).digest()
    return "sha1=" + base64.b64encode(digest).decode()


TICKET_CREATE = json.dumps({
    "Action": "Create",
    "Guid": "8f1c1d5e-2f4b-4b1e-9d0e-3a0f1d2c3b4a",
    "EntityType": "Ticket",
    "Id": 12345,
    "Fields": {"Title": "Printer offline"},
    "EventTime": "2026-10-22T10:00:00Z",
    "SequenceNumber": 7,
    "PersonID": 29682894,
}).encode()


def post(body: bytes, headers=None, content_type="application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/autotask", content=body, headers=h)


class TestVerify:
    def test_valid(self):
        assert verify_autotask_webhook(TICKET_CREATE, sign(TICKET_CREATE), SECRET)

    def test_wrong_secret(self):
        assert not verify_autotask_webhook(TICKET_CREATE, sign(TICKET_CREATE, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_autotask_webhook(TICKET_CREATE + b" ", sign(TICKET_CREATE), SECRET)

    def test_missing_prefix(self):
        assert not verify_autotask_webhook(TICKET_CREATE, sign(TICKET_CREATE)[5:], SECRET)

    def test_padding_stripped(self):
        assert not verify_autotask_webhook(TICKET_CREATE, sign(TICKET_CREATE).rstrip("="), SECRET)

    def test_non_ascii_header_does_not_raise(self):
        assert not verify_autotask_webhook(TICKET_CREATE, "sha1=café✓", SECRET)


class TestEndpoint:
    def test_signed_ticket_create(self):
        assert post(TICKET_CREATE, {"X-Hook-Signature": sign(TICKET_CREATE)}).status_code == 200

    @pytest.mark.parametrize("entity,action", [
        ("Company", "Update"),
        ("Contact", "Delete"),
        ("TicketNote", "Create"),
        ("Company", "Deactivated"),
        ("ConfigurationItem", "Create"),
    ])
    def test_other_events(self, entity, action):
        body = json.dumps({"Action": action, "EntityType": entity, "Id": 1, "Fields": {}}).encode()
        assert post(body, {"X-Hook-Signature": sign(body)}).status_code == 200

    def test_any_content_type(self):
        res = post(TICKET_CREATE, {"X-Hook-Signature": sign(TICKET_CREATE)}, "text/plain")
        assert res.status_code == 200

    def test_missing_header(self):
        assert post(TICKET_CREATE).status_code == 401

    def test_invalid_signature(self):
        assert post(TICKET_CREATE, {"X-Hook-Signature": "sha1=AAAAAAAAAAAAAAAAAAAAAAAAAAA="}).status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/autotask",
            content=TICKET_CREATE,
            headers=[(b"content-type", b"application/json"), (b"x-hook-signature", "sha1=café".encode("latin-1"))],
        )
        assert res.status_code == 401

    def test_signed_non_json(self):
        assert post(b"not json", {"X-Hook-Signature": sign(b"not json")}).status_code == 400
