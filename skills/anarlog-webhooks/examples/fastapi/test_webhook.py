import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Anarlog secrets look like whsec_... but the WHOLE string is the HMAC key (not Standard Webhooks)
os.environ["ANARLOG_WEBHOOK_SECRET"] = "whsec_test_anarlog_secret"

from main import app, verify_anarlog_webhook

client = TestClient(app)
SECRET = os.environ["ANARLOG_WEBHOOK_SECRET"]


def meeting_payload(event: str) -> dict:
    return {
        "id": "evt_123",
        "event": event,
        "created_at": "2026-07-28T09:00:00.000Z",
        "data": {
            "meeting": {
                "id": "mtg_1",
                "title": "Weekly sync",
                "note": {},
                "summaries": [],
                "participants": [],
                "action_items": [{"text": "Send follow-up"}],
            },
            "transcript_text": "Hello everyone",
        },
    }


def generate_anarlog_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Anarlog signature for testing (sha256=<hex> of the raw body)."""
    return "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


class TestVerifyAnarlogWebhook:
    payload = b'{"event":"webhook.test"}'

    def test_valid_signature_returns_true(self):
        assert verify_anarlog_webhook(self.payload, generate_anarlog_signature(self.payload, SECRET), SECRET) is True

    def test_uppercase_hex_is_accepted(self):
        header = "sha256=" + generate_anarlog_signature(self.payload, SECRET)[7:].upper()
        assert verify_anarlog_webhook(self.payload, header, SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_anarlog_webhook(self.payload, "sha256=invalid", SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_anarlog_webhook(self.payload, None, SECRET) is False

    def test_missing_secret_returns_false(self):
        assert verify_anarlog_webhook(self.payload, generate_anarlog_signature(self.payload, SECRET), None) is False

    def test_prefix_is_required(self):
        assert verify_anarlog_webhook(self.payload, generate_anarlog_signature(self.payload, SECRET)[7:], SECRET) is False

    def test_non_ascii_signature_returns_false_without_raising(self):
        assert verify_anarlog_webhook(self.payload, "sha256=é" + "0" * 63, SECRET) is False

    def test_trailing_junk_returns_false(self):
        assert verify_anarlog_webhook(self.payload, generate_anarlog_signature(self.payload, SECRET) + "zz", SECRET) is False

    def test_whole_whsec_secret_is_the_key(self):
        stripped = hmac.new(SECRET[len("whsec_"):].encode(), self.payload, hashlib.sha256).hexdigest()
        assert verify_anarlog_webhook(self.payload, f"sha256={stripped}", SECRET) is False


class TestAnarlogWebhookEndpoint:
    def post(self, body: bytes, signature=None, content_type="application/json", extra=None):
        headers = {"content-type": content_type}
        if signature is not None:
            headers["x-anarlog-signature"] = signature
        headers.update(extra or {})
        return client.post("/webhooks/anarlog", content=body, headers=headers)

    def test_missing_signature_returns_401(self):
        response = self.post(json.dumps(meeting_payload("meeting.completed")).encode())
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        response = self.post(json.dumps(meeting_payload("meeting.completed")).encode(), "sha256=" + "0" * 64)
        assert response.status_code == 401

    def test_non_ascii_signature_returns_401_not_500(self):
        body = json.dumps(meeting_payload("meeting.completed")).encode()
        # httpx only accepts non-ASCII header values as bytes (latin-1 on the wire)
        response = self.post(body, ("sha256=é" + "0" * 63).encode("latin-1"))
        assert response.status_code == 401

    @pytest.mark.parametrize("event", ["meeting.completed", "note.enhanced", "webhook.test"])
    def test_valid_events_return_200(self, event):
        body = json.dumps(meeting_payload(event)).encode()
        response = self.post(
            body,
            generate_anarlog_signature(body, SECRET),
            extra={"x-anarlog-event": event, "x-anarlog-timestamp": "1785229200"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unhandled_event_returns_200(self):
        body = json.dumps(meeting_payload("meeting.deleted")).encode()
        assert self.post(body, generate_anarlog_signature(body, SECRET)).status_code == 200

    def test_other_content_type_still_verifies(self):
        body = json.dumps(meeting_payload("webhook.test")).encode()
        response = self.post(body, generate_anarlog_signature(body, SECRET), content_type="text/plain")
        assert response.status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        response = self.post(body, generate_anarlog_signature(body, SECRET), content_type="text/plain")
        assert response.status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
