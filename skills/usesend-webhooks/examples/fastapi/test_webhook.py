import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

# useSend secrets look like whsec_...; the WHOLE string is the HMAC key.
SECRET = "whsec_test_secret_key_for_usesend"

from main import app, verify_usesend  # noqa: E402

client = TestClient(app)

# Payload shaped like useSend's documented email.delivered example.
DELIVERED = {
    "id": "call_abc123",
    "type": "email.delivered",
    "version": "2026-01-18",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "teamId": 123,
    "data": {
        "id": "email_123",
        "status": "DELIVERED",
        "from": "sender@example.com",
        "to": ["recipient@example.com"],
        "subject": "Welcome!",
        "occurredAt": "2024-01-15T10:30:00Z",
    },
    "attempt": 1,
}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("USESEND_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("USESEND_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like useSend: HMAC-SHA256(secret, f"{timestamp}.{rawBody}"), hex."""
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def now_ms() -> str:
    return str(int(time.time() * 1000))


def post(body, signature=None, timestamp=None, content_type="application/json", omit_sig=False, omit_ts=False):
    body = body if isinstance(body, bytes) else body.encode()
    ts = now_ms() if timestamp is None else timestamp
    headers = {"content-type": content_type}
    if not omit_sig:
        headers["x-usesend-signature"] = f"v1={sign(body, ts)}" if signature is None else signature
    if not omit_ts:
        headers["x-usesend-timestamp"] = ts
    return client.post("/webhooks/usesend", content=body, headers=headers)


def payload(**overrides) -> bytes:
    return json.dumps({**DELIVERED, **overrides}).encode()


class TestValidRequests:
    def test_valid_v1_signature(self):
        assert post(payload()).status_code == 200

    def test_bare_digest_without_prefix(self):
        body, ts = payload(), now_ms()
        assert post(body, signature=sign(body, ts), timestamp=ts).status_code == 200

    def test_uppercase_hex_digest(self):
        body, ts = payload(), now_ms()
        assert post(body, signature=f"v1={sign(body, ts).upper()}", timestamp=ts).status_code == 200

    def test_exact_bytes_whatever_the_content_type(self):
        body = json.dumps(DELIVERED, indent=2)
        assert post(body, content_type="text/plain").status_code == 200

    def test_webhook_test_event(self):
        body = json.dumps({"type": "webhook.test", "test": True, "webhookId": "wh_abc123", "sentAt": "2024-01-15T10:30:00.000Z"})
        assert post(body).status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        ["email.bounced", "email.complained", "email.opened", "email.clicked", "contact.created", "domain.verified", "email.queued"],
    )
    def test_events(self, event_type):
        assert post(payload(type=event_type)).status_code == 200


class TestInvalidRequests:
    def test_wrong_secret(self):
        body, ts = payload(), now_ms()
        assert post(body, signature=f"v1={sign(body, ts, 'whsec_other')}", timestamp=ts).status_code == 401

    def test_secret_without_whsec_prefix(self):
        body, ts = payload(), now_ms()
        sig = f"v1={sign(body, ts, SECRET.replace('whsec_', ''))}"
        assert post(body, signature=sig, timestamp=ts).status_code == 401

    def test_tampered_body(self):
        ts = now_ms()
        sig = f"v1={sign(payload(), ts)}"
        assert post(payload(id="call_evil"), signature=sig, timestamp=ts).status_code == 401

    def test_signature_over_different_timestamp(self):
        body = payload()
        sig = f"v1={sign(body, '1700000000000')}"
        assert post(body, signature=sig, timestamp="1700000000001").status_code == 401

    def test_missing_signature(self):
        assert post(payload(), omit_sig=True).status_code == 401

    def test_missing_timestamp(self):
        assert post(payload(), signature=f"v1={'a' * 64}", omit_ts=True).status_code == 401

    def test_empty_signature(self):
        assert post(payload(), signature="").status_code == 401

    @pytest.mark.parametrize(
        "signature",
        [f"v1={'a' * 63}", f"v1={'a' * 65}", f"v1={'z' * 64}", "v1="],
        ids=["too-short", "too-long", "non-hex", "prefix-only"],
    )
    def test_malformed_signature(self, signature):
        assert post(payload(), signature=signature).status_code == 401

    def test_signed_non_json_body_is_400(self):
        assert post("not json").status_code == 400

    def test_signed_json_non_object_is_400(self):
        assert post("[1, 2]").status_code == 400


class TestTimestampTolerance:
    def test_old_timestamps_accepted_by_default(self):
        body = payload()
        ts = str(int(time.time() * 1000) - 24 * 60 * 60 * 1000)
        assert post(body, timestamp=ts).status_code == 200

    def test_old_timestamp_rejected_when_set(self, monkeypatch):
        monkeypatch.setenv("USESEND_WEBHOOK_TOLERANCE_SECONDS", "300")
        ts = str(int(time.time() * 1000) - 10 * 60 * 1000)
        assert post(payload(), timestamp=ts).status_code == 401

    def test_fresh_timestamp_accepted_when_set(self, monkeypatch):
        monkeypatch.setenv("USESEND_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(payload()).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("USESEND_WEBHOOK_TOLERANCE_SECONDS", "0")
        ts = str(int(time.time() * 1000) - 24 * 60 * 60 * 1000)
        assert post(payload(), timestamp=ts).status_code == 200


class TestVerifyUseSend:
    def test_missing_secret(self):
        assert verify_usesend(b"x", f"v1={'a' * 64}", "1", "") is False

    def test_non_utf8_body(self):
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        ts = "1700000000000"
        assert verify_usesend(body, f"v1={sign(body, ts)}", ts, SECRET) is True
