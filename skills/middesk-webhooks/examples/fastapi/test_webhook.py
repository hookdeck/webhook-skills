import hashlib
import hmac
import json
import base64
import os
from typing import Optional

import pytest
from fastapi.testclient import TestClient

# Middesk secrets are arbitrary strings (e.g. whsec_... or sec_...) used whole as the key.
SECRET = "whsec_abcdef123456"
os.environ["MIDDESK_WEBHOOK_SECRET"] = SECRET

from main import app, verify_middesk_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, key: bytes = SECRET.encode()) -> str:
    """Real Middesk algorithm: bare hex HMAC-SHA256 of the raw body, secret as UTF-8 string."""
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def event_payload(event_type: str) -> bytes:
    return json.dumps({
        "object": "event",
        "id": "f215a707-655e-400f-84e6-fbb949f5612a",
        "type": event_type,
        "data": {
            "object": {
                "id": "0f86dab5-8195-4b95-b3c0-19deaeba2a8e",
                "object": "business",
                "name": "A Company",
                "status": "open",
            }
        },
        "created_at": "2020-01-02T23:54:48.239Z",
    }).encode()


def post(payload: bytes, signature: Optional[str] = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature:
        headers["x-middesk-signature-256"] = signature
    return client.post("/webhooks/middesk", content=payload, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        payload = event_payload("business.created")
        assert verify_middesk_webhook(payload, sign(payload), SECRET)

    def test_whole_secret_used_as_utf8(self):
        payload = event_payload("business.created")
        assert not verify_middesk_webhook(payload, sign(payload, b"abcdef123456"), SECRET)
        decoded = base64.b64decode("abcdef123456")
        assert not verify_middesk_webhook(payload, sign(payload, decoded), SECRET)

    def test_wrong_secret(self):
        payload = event_payload("business.created")
        assert not verify_middesk_webhook(payload, sign(payload, b"sec_wrong"), SECRET)

    def test_modified_body(self):
        signature = sign(event_payload("business.created"))
        assert not verify_middesk_webhook(event_payload("business.updated"), signature, SECRET)

    def test_missing_or_malformed(self):
        payload = event_payload("business.created")
        assert not verify_middesk_webhook(payload, None, SECRET)
        assert not verify_middesk_webhook(payload, "abcd", SECRET)
        assert not verify_middesk_webhook(payload, "é" * 64, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("event_type", [
        "business.created",
        "business.updated",
        "order.created",
        "order.updated",
        "monitor.created",
        "monitor.updated",
        "tin.retried",
        "lien.updated",
    ])
    def test_handles_event(self, event_type):
        payload = event_payload(event_type)
        response = post(payload, sign(payload))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unhandled_event_returns_200(self):
        payload = event_payload("person.created")
        assert post(payload, sign(payload)).status_code == 200

    def test_any_content_type(self):
        payload = event_payload("business.created")
        assert post(payload, sign(payload), "text/plain").status_code == 200

    def test_invalid_signature(self):
        assert post(event_payload("business.created"), "a" * 64).status_code == 400

    def test_missing_signature(self):
        assert post(event_payload("business.created")).status_code == 400

    def test_signed_non_json(self):
        payload = b"not json"
        assert post(payload, sign(payload), "text/plain").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
