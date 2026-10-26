import hashlib
import hmac
import itertools
import json
import os
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

# Security token as shown in the Quicknode dashboard; used as UTF-8 text, not decoded
os.environ["QUICKNODE_WEBHOOK_SECRET"] = "qn_test_security_token_0123456789"

from main import app, processed_nonces, verify_quicknode_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["QUICKNODE_WEBHOOK_SECRET"]
_counter = itertools.count()


def sign(nonce: str, timestamp: str, body: bytes, secret: str = SECRET) -> str:
    """Real Quicknode algorithm: hex HMAC-SHA256 over nonce + timestamp + body, no separators."""
    content = b"".join([nonce.encode("latin-1"), timestamp.encode("latin-1"), body])
    return hmac.new(secret.encode("utf-8"), content, hashlib.sha256).hexdigest()


def delivery(body, nonce=None, timestamp=None, signature=None):
    body = body.encode() if isinstance(body, str) else body
    nonce = nonce if nonce is not None else f"nonce-{time.time_ns()}-{next(_counter)}"
    timestamp = timestamp if timestamp is not None else str(int(time.time()))
    return body, {
        "Content-Type": "application/json",
        "X-QN-Nonce": nonce,
        "X-QN-Timestamp": timestamp,
        "X-QN-Signature": signature if signature is not None else sign(nonce, timestamp, body),
    }


def post(d):
    body, headers = d
    return client.post("/webhooks/quicknode", content=body, headers=headers)


# Illustrative payloads (Quicknode has no event types)
STREAMS_BATCH = json.dumps({
    "data": [{"number": "0x1", "hash": "0xabc"}],
    "metadata": {"dataset": "block", "network": "ethereum-mainnet", "stream_id": "stream-1"},
})
WEBHOOK_MATCHES = json.dumps([{"hash": "0xdef", "from": "0x01", "to": "0x02"}])


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    processed_nonces.clear()
    monkeypatch.setenv("QUICKNODE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("QUICKNODE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestQuicknodeWebhook:
    def test_valid_streams_batch(self):
        assert post(delivery(STREAMS_BATCH)).status_code == 200

    def test_valid_webhooks_array(self):
        assert post(delivery(WEBHOOK_MATCHES)).status_code == 200

    def test_any_content_type(self):
        body, headers = delivery(STREAMS_BATCH)
        headers["Content-Type"] = "text/plain"
        assert post((body, headers)).status_code == 200

    def test_verifies_exact_bytes_received(self):
        spaced = '{ "data": [ 1 ],   "metadata": { "dataset": "block" } }\n'
        assert post(delivery(spaced)).status_code == 200

    def test_uppercase_hex_signature(self):
        body, headers = delivery(STREAMS_BATCH)
        headers["X-QN-Signature"] = headers["X-QN-Signature"].upper()
        assert post((body, headers)).status_code == 200

    @pytest.mark.parametrize("name", ["X-QN-Signature", "X-QN-Nonce", "X-QN-Timestamp"])
    def test_missing_header_is_401(self, name):
        body, headers = delivery(STREAMS_BATCH)
        del headers[name]
        assert post((body, headers)).status_code == 401

    def test_empty_signature_is_401(self):
        body, headers = delivery(STREAMS_BATCH)
        headers["X-QN-Signature"] = ""
        assert post((body, headers)).status_code == 401

    def test_malformed_signatures_are_401(self):
        good = sign("n", "t", STREAMS_BATCH.encode())
        for bad in [good[:63], good + "0", "z" * 64, f"sha256={good}", f"{good},{good}"]:
            assert post(delivery(STREAMS_BATCH, nonce="n", timestamp="t", signature=bad)).status_code == 401

    def test_wrong_secret_is_401(self):
        sig = sign("n1", "1", STREAMS_BATCH.encode(), "other")
        assert post(delivery(STREAMS_BATCH, nonce="n1", timestamp="1", signature=sig)).status_code == 401

    def test_tampered_body_nonce_or_timestamp_is_401(self):
        body, headers = delivery(STREAMS_BATCH)
        assert post((body.replace(b"0x1", b"0x2"), headers)).status_code == 401

        body, headers = delivery(STREAMS_BATCH)
        headers["X-QN-Nonce"] = "another-nonce"
        assert post((body, headers)).status_code == 401

        body, headers = delivery(STREAMS_BATCH)
        headers["X-QN-Timestamp"] = "1"
        assert post((body, headers)).status_code == 401

    def test_separator_signature_is_rejected(self):
        sig = hmac.new(SECRET.encode(), f"n.t.{STREAMS_BATCH}".encode(), hashlib.sha256).hexdigest()
        assert post(delivery(STREAMS_BATCH, nonce="n", timestamp="t", signature=sig)).status_code == 401

    def test_signed_non_json_is_400(self):
        assert post(delivery("not json")).status_code == 400

    def test_no_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("QUICKNODE_WEBHOOK_SECRET")
        assert post(delivery(STREAMS_BATCH)).status_code == 500

    def test_repeated_nonce_is_acknowledged_once(self):
        d = delivery(STREAMS_BATCH)
        assert "duplicate" not in post(d).json()
        assert post(d).json()["duplicate"] is True


class TestTimestampTolerance:
    def test_old_timestamps_ignored_by_default(self):
        assert post(delivery(STREAMS_BATCH, timestamp="1000000000")).status_code == 200

    def test_old_timestamp_rejected_when_enabled(self, monkeypatch):
        monkeypatch.setenv("QUICKNODE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(delivery(STREAMS_BATCH, timestamp=str(int(time.time()) - 3600))).status_code == 401

    def test_fresh_timestamps_accepted_when_enabled(self, monkeypatch):
        monkeypatch.setenv("QUICKNODE_WEBHOOK_TOLERANCE_SECONDS", "300")
        for ts in [str(int(time.time())), str(int(time.time() * 1000)), datetime.now(timezone.utc).isoformat()]:
            assert post(delivery(STREAMS_BATCH, timestamp=ts)).status_code == 200

    def test_unparseable_timestamp_rejected_when_enabled(self, monkeypatch):
        monkeypatch.setenv("QUICKNODE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(delivery(STREAMS_BATCH, timestamp="soon")).status_code == 401


class TestVerifyFunction:
    def test_header_values_are_latin1(self):
        body = b"{}"
        content = bytes([0x63, 0x61, 0x66, 0xE9]) + b"1" + body
        sig = hmac.new(SECRET.encode(), content, hashlib.sha256).hexdigest()
        headers = {"x-qn-nonce": "café", "x-qn-timestamp": "1", "x-qn-signature": sig}
        assert verify_quicknode_webhook(body, headers, SECRET) == (True, None)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
