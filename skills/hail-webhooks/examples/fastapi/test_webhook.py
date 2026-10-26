import hashlib
import hmac
import json
import logging
import os
import time
import base64

import pytest
from fastapi.testclient import TestClient

# Hail signing secrets look like whsec_..., but the whole string is the HMAC key (not Standard Webhooks)
SECRET = "whsec_test_hail_secret_8f3a1c"
os.environ["HAIL_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def v1_for(body, timestamp, secret=SECRET) -> str:
    raw = body.encode() if isinstance(body, str) else body
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, f"{timestamp}.".encode() + raw, hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={v1_for(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        # encode as latin-1 so a non-ASCII header value reaches the app as raw bytes
        headers["X-Hail-Signature"] = signature.encode("latin-1")
    return client.post("/webhooks/hail", content=body, headers=headers)


EMAIL_RECEIVED = json.dumps({
    "id": "9f2c1",
    "type": "email.received",
    "api_version": "2026-06-06",
    "created_at": "2026-06-14T12:00:00+00:00",
    "organization_id": "org-uuid",
    "data": {"id": "em-uuid", "direction": "inbound", "from_address": "sender@example.com", "subject": "Re: invoice"},
})


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("HAIL_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
    monkeypatch.setenv("HAIL_WEBHOOK_SECRET", SECRET)


def test_docs_worked_example(monkeypatch):
    monkeypatch.setenv("HAIL_WEBHOOK_SECRET", "whsec_example")
    body = '{"id":"evt_123","type":"email.received","data":{"id":"em_1"}}'
    header = "t=1700000000,v1=72f7940d13ca8528cf655a04e82dabfe90a531e239241fda9bdff72980d33a4a"
    assert post(body, header).status_code == 200


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED), "text/plain").status_code == 200

    def test_allows_space_after_comma(self):
        t = int(time.time())
        assert post(EMAIL_RECEIVED, f"t={t}, v1={v1_for(EMAIL_RECEIVED, t)}").status_code == 200

    def test_accepts_when_any_v1_matches(self):
        t = int(time.time())
        stale = v1_for(EMAIL_RECEIVED, t, "whsec_old_secret")
        assert post(EMAIL_RECEIVED, f"t={t},v1={stale},v1={v1_for(EMAIL_RECEIVED, t)}").status_code == 200

    def test_accepts_uppercase_hex(self):
        t = int(time.time())
        assert post(EMAIL_RECEIVED, f"t={t},v1={v1_for(EMAIL_RECEIVED, t).upper()}").status_code == 200

    def test_rejects_missing_header(self):
        assert post(EMAIL_RECEIVED).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(EMAIL_RECEIVED.replace("invoice", "refund"), sign(EMAIL_RECEIVED)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED, secret="other_secret")).status_code == 400

    def test_rejects_stripped_or_base64_decoded_secret(self):
        t = int(time.time())
        stripped = SECRET[len("whsec_"):]
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED, t, stripped)).status_code == 400
        decoded = base64.b64decode(stripped + "=" * (-len(stripped) % 4))
        assert post(EMAIL_RECEIVED, f"t={t},v1={v1_for(EMAIL_RECEIVED, t, decoded)}").status_code == 400

    def test_rejects_wrong_length_and_non_hex_without_error(self):
        assert post(EMAIL_RECEIVED, "t=1700000000,v1=abc").status_code == 400
        assert post(EMAIL_RECEIVED, "t=1700000000,v1=" + "z" * 64).status_code == 400

    def test_non_ascii_header_is_400_not_500(self):
        assert post(EMAIL_RECEIVED, "t=1700000000,v1=" + "a" * 63 + "é").status_code == 400

    def test_rejects_header_without_t_or_v1(self):
        t = int(time.time())
        assert post(EMAIL_RECEIVED, f"v1={v1_for(EMAIL_RECEIVED, t)}").status_code == 400
        assert post(EMAIL_RECEIVED, f"t={t}").status_code == 400
        assert post(EMAIL_RECEIVED, "garbage").status_code == 400

    def test_rejects_altered_timestamp(self):
        header = sign(EMAIL_RECEIVED, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(EMAIL_RECEIVED, header).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        old = int(time.time()) - 3600
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("HAIL_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED, old)).status_code == 400
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch, caplog):
        monkeypatch.setenv("HAIL_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED, old)).status_code == 200

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("HAIL_WEBHOOK_SECRET")
        assert post(EMAIL_RECEIVED, sign(EMAIL_RECEIVED)).status_code == 500


EVENTS = [
    "email.received", "email.received.suppressed", "email.delivered", "email.delivery_delayed",
    "email.bounced", "email.complained", "email.opened", "email.clicked", "email.send_failed",
    "sms.received", "sms.delivered", "sms.undelivered", "sms.failed",
    "call.received", "call.answered", "call.completed", "call.failed", "call.busy",
    "call.no_answer", "call.transferred",
]


class TestEvents:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, caplog):
        body = json.dumps({"id": "e1", "type": event_type, "data": {"id": "x1", "direction": "inbound", "from": "+1", "to": "+2"}})
        with caplog.at_level(logging.INFO, logger="hail-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled" not in caplog.text

    def test_unknown_event_is_acknowledged(self, caplog):
        body = json.dumps({"id": "e1", "type": "domain.verified", "data": {}})
        with caplog.at_level(logging.INFO, logger="hail-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: domain.verified" in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
