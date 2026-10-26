import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "test_client_secret"
os.environ["WHOOP_WEBHOOK_SECRET"] = SECRET
os.environ.pop("WHOOP_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, verify_whoop_signature, is_timestamp_fresh  # noqa: E402

client = TestClient(app)

# Doc example payload (sleep.updated)
SLEEP_PAYLOAD = {
    "user_id": 456,
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "sleep.updated",
    "trace_id": "e369c784-5100-49e8-8098-75d35c47b31b",
}
BODY = json.dumps(SLEEP_PAYLOAD).encode()


def sign(body: bytes, timestamp: str, key: str = SECRET) -> str:
    """base64(HMAC-SHA256(secret, timestamp + rawBody)), no separator."""
    digest = hmac.new(key.encode(), timestamp.encode("latin-1") + body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def send(body: bytes, timestamp="__now__", signature="__auto__", content_type="application/json"):
    if timestamp == "__now__":
        timestamp = str(int(time.time() * 1000))
    headers = {"Content-Type": content_type}
    if signature == "__auto__":
        signature = sign(body, timestamp or "")
    if signature is not None:
        headers["X-WHOOP-Signature"] = signature
    if timestamp is not None:
        headers["X-WHOOP-Signature-Timestamp"] = timestamp
    return client.post("/webhooks/whoop", content=body, headers=headers)


class TestVerifyWhoopSignature:
    ts = "1700000000000"

    def test_accepts_valid_signature(self):
        assert verify_whoop_signature(BODY, sign(BODY, self.ts), self.ts, SECRET)

    def test_rejects_other_secret_timestamp_or_body(self):
        assert not verify_whoop_signature(BODY, sign(BODY, self.ts, "other"), self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sign(BODY, self.ts), "1700000000001", SECRET)
        assert not verify_whoop_signature(b"{}", sign(BODY, self.ts), self.ts, SECRET)

    def test_rejects_missing_values(self):
        sig = sign(BODY, self.ts)
        assert not verify_whoop_signature(BODY, None, self.ts, SECRET)
        assert not verify_whoop_signature(BODY, "", self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sig, None, SECRET)
        assert not verify_whoop_signature(BODY, sig, "", SECRET)
        assert not verify_whoop_signature(BODY, sig, self.ts, None)

    def test_rejects_malformed_signatures(self):
        sig = sign(BODY, self.ts)
        assert not verify_whoop_signature(BODY, sig[:-1], self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sig.rstrip("="), self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sig[:43] + "!", self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sig + sig, self.ts, SECRET)
        assert not verify_whoop_signature(BODY, "sha256=" + sig, self.ts, SECRET)
        assert not verify_whoop_signature(BODY, sig + "\n", self.ts, SECRET)
        assert not verify_whoop_signature(BODY, "é" * 44, self.ts, SECRET)

    def test_is_case_sensitive(self):
        assert not verify_whoop_signature(BODY, sign(BODY, self.ts).lower(), self.ts, SECRET)


class TestIsTimestampFresh:
    now = 1700000000000

    def test_off_by_default(self):
        assert is_timestamp_fresh("1", None, self.now)
        assert is_timestamp_fresh("1", 0, self.now)

    def test_uses_milliseconds_when_enabled(self):
        assert is_timestamp_fresh(str(self.now - 299000), 300, self.now)
        assert not is_timestamp_fresh(str(self.now - 301000), 300, self.now)
        assert not is_timestamp_fresh("not-a-number", 300, self.now)


class TestWebhookEndpoint:
    def test_valid_webhook(self):
        res = send(BODY)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        assert send(BODY, content_type="text/plain").status_code == 200

    def test_bytes_that_do_not_survive_reserialization(self):
        raw = '{ "user_id": 456,  "id": "550e8400-e29b-41d4-a716-446655440000", "type": "sleep.updated", "note": "héllo" }'.encode()
        assert send(raw).status_code == 200

    def test_old_timestamp_accepted_by_default(self):
        assert send(BODY, timestamp="1700000000000").status_code == 200

    def test_invalid_signature(self):
        assert send(BODY, signature="A" * 43 + "=").status_code == 401

    def test_malformed_signature(self):
        assert send(BODY, signature="not-base64").status_code == 401

    def test_missing_signature(self):
        assert send(BODY, signature=None).status_code == 401

    def test_missing_timestamp(self):
        assert send(BODY, timestamp=None, signature=sign(BODY, "")).status_code == 401

    def test_signed_non_json_body(self):
        assert send(b"not json").status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        [
            "sleep.updated", "sleep.deleted", "workout.updated", "workout.deleted",
            "recovery.updated", "recovery.deleted", "something.new",
        ],
    )
    def test_acknowledges_event_types(self, event_type):
        body = json.dumps({**SLEEP_PAYLOAD, "type": event_type}).encode()
        assert send(body).status_code == 200


class TestTolerance:
    @pytest.fixture(autouse=True)
    def tolerance(self, monkeypatch):
        monkeypatch.setenv("WHOOP_WEBHOOK_TOLERANCE_SECONDS", "300")

    def test_fresh_timestamp(self):
        assert send(BODY).status_code == 200

    def test_stale_timestamp_rejected_even_when_signed(self):
        stale = str(int(time.time() * 1000) - 3600 * 1000)
        assert send(BODY, timestamp=stale).status_code == 401
