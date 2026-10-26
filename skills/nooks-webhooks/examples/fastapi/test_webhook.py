import base64
import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Nooks signing keys look like nooks-webhook-signing-key-...; used as-is. This one is only for tests
SECRET = "nooks-webhook-signing-key-test8f3a1c"
os.environ["NOOKS_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


# t is Unix milliseconds; s is base64 HMAC-SHA256 of "<t>.<raw body>"
def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time() * 1000) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).digest()
    return f"t={ts},s={base64.b64encode(digest).decode()}"


def post(body, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["x-webhook-signature"] = signature
    return client.post("/webhooks/nooks", content=body, headers=headers)


CALL_LOGGED = json.dumps({
    "event": "call.logged",
    "eventId": "ed573041-57e9-4ef6-9976-bb759761c2a7-#-22216d73-1351-4e4b-ae0c-64d7fc46b8c1",
    "occurredAt": "2025-12-09T04:06:36.145Z",
    "callData": {
        "callId": "ed573041-57e9-4ef6-9976-bb759761c2a7",
        "workspaceId": "cUvwa9fcNtE1G7vy",
        "status": "completed",
        "userData": {"userId": "test-user-id", "email": "test-user-email", "name": "test-user-name"},
        "prospectData": {"prospectId": "0056s00000D1gRtAAJ", "name": "Jane Smith", "phoneNumber": "+14155551234", "email": "jane.smith@acme.com", "linkedInUrl": None},
        "accountData": {"accountId": "test-account-id", "name": "test-account-name"},
        "callDirection": "inbound",
        "disposition": {"id": "test-disposition-id", "name": "Connected"},
        "startedAt": "2025-12-09T02:54:29.170Z",
        "durationSeconds": 100,
        "recordingUrl": None,
        "notes": None,
        "transcriptUrl": None,
        "sequenceData": None,
    },
})

HOUR_MS = 60 * 60 * 1000


@pytest.fixture(autouse=True)
def reset_tolerance(monkeypatch):
    monkeypatch.delenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


class TestSignatureVerification:
    def test_accepts_valid_signature_and_handles_call_logged(self, caplog):
        with caplog.at_level(logging.INFO, logger="nooks-webhooks"):
            res = post(CALL_LOGGED, sign(CALL_LOGGED))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Call ed573041-57e9-4ef6-9976-bb759761c2a7 logged: completed" in caplog.text

    def test_verifies_regardless_of_content_type(self):
        assert post(CALL_LOGGED, sign(CALL_LOGGED), "text/plain").status_code == 200

    def test_accepts_signature_ending_in_padding(self):
        # Prove the parser keeps the trailing '=' (split on the first '=' only)
        i = 0
        while True:
            body = json.dumps({"event": "call.logged", "n": i})
            header = sign(body)
            if header.endswith("="):
                break
            i += 1
        assert post(body, header).status_code == 200

    def test_rejects_unsigned_request_by_default(self, caplog):
        with caplog.at_level(logging.INFO, logger="nooks-webhooks"):
            res = post(CALL_LOGGED, None)
        assert res.status_code == 401
        assert "Call " not in caplog.text

    def test_acknowledges_unsigned_activation_ping_when_opted_in(self, monkeypatch, caplog):
        monkeypatch.setenv("NOOKS_ACCEPT_UNSIGNED_PING", "true")
        monkeypatch.delenv("NOOKS_WEBHOOK_SECRET", raising=False)  # no key exists before activation
        with caplog.at_level(logging.INFO, logger="nooks-webhooks"):
            res = post(CALL_LOGGED, None)
        assert res.status_code == 200
        assert "Call " not in caplog.text
        assert client.post("/webhooks/nooks").status_code == 200

    def test_opt_in_still_verifies_signed_requests(self, monkeypatch):
        monkeypatch.setenv("NOOKS_ACCEPT_UNSIGNED_PING", "true")
        assert post(CALL_LOGGED, sign(CALL_LOGGED, secret="other_key")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(CALL_LOGGED.replace("completed", "failed"), sign(CALL_LOGGED)).status_code == 401

    def test_rejects_wrong_key(self):
        assert post(CALL_LOGGED, sign(CALL_LOGGED, secret="other_key")).status_code == 401

    def test_rejects_mismatched_timestamp(self):
        header = sign(CALL_LOGGED, 1700000000000)
        assert post(CALL_LOGGED, header.replace("t=1700000000000", "t=1700000000001")).status_code == 401

    @pytest.mark.parametrize("header", ["garbage", "t=123", "s=abc", "t=abc,s=abc", "t=,s=", ",,,", "t=1e3,s=abc"])
    def test_rejects_malformed_headers(self, header):
        assert post(CALL_LOGGED, header).status_code == 401

    def test_rejects_wrong_length_signature(self):
        assert post(CALL_LOGGED, f"t={int(time.time() * 1000)},s=AAAA").status_code == 401

    def test_does_not_leniently_decode_the_header(self):
        assert post(CALL_LOGGED, sign(CALL_LOGGED) + "AAAA").status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        header = f"t={int(time.time() * 1000)},s=ñandú".encode("utf-8")
        res = client.post(
            "/webhooks/nooks",
            content=CALL_LOGGED,
            headers={"Content-Type": "application/json", "x-webhook-signature": header},
        )
        assert res.status_code == 401

    def test_invalid_json_is_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_json_null_body_is_not_a_500(self):
        assert post("null", sign("null")).status_code == 200

    def test_logs_unhandled_events(self, caplog):
        body = json.dumps({"event": "something.else"})
        with caplog.at_level(logging.INFO, logger="nooks-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        assert "Unhandled event: something.else" in caplog.text


class TestTimestampWindow:
    def test_off_by_default_hour_old_timestamp_verifies(self):
        old = int(time.time() * 1000) - HOUR_MS
        assert post(CALL_LOGGED, sign(CALL_LOGGED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time() * 1000) - HOUR_MS
        assert post(CALL_LOGGED, sign(CALL_LOGGED, old)).status_code == 401

    def test_t_is_milliseconds(self, monkeypatch):
        monkeypatch.setenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS", "300")
        recent = int(time.time() * 1000) - 60 * 1000
        assert post(CALL_LOGGED, sign(CALL_LOGGED, recent)).status_code == 200

    def test_widened_window_accepts_hour_old_timestamp(self, monkeypatch):
        monkeypatch.setenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS", "86400")
        old = int(time.time() * 1000) - HOUR_MS
        assert post(CALL_LOGGED, sign(CALL_LOGGED, old)).status_code == 200

    def test_invalid_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time() * 1000) - HOUR_MS
        assert post(CALL_LOGGED, sign(CALL_LOGGED, old)).status_code == 200


def test_missing_signing_key_is_500(monkeypatch):
    monkeypatch.delenv("NOOKS_WEBHOOK_SECRET")
    assert post(CALL_LOGGED, sign(CALL_LOGGED)).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
