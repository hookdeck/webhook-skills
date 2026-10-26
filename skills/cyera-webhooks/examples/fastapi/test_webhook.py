# Generated with: cyera-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Cyera's docs show Webhook Secrets that look like `dgwebhook...`; the whole
# string is the HMAC key (UTF-8 bytes), never decoded.
SECRET = "dgwebhook_test_secret_key"
os.environ["CYERA_WEBHOOK_SECRET"] = SECRET
os.environ.pop("CYERA_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, verify_cyera_signature  # noqa: E402

client = TestClient(app)

# Payloads follow the samples in Cyera's webhook docs.
ACCESS = {
    "request_type": "access",
    "integration_name": "Webhook Integration",
    "integration_kind": "webhook",
    "topic": "privacy_request:create",
    "identifiers": {"email": [{"email": "john@example.com"}], "user_id": [{"user_id": "100101"}]},
    "webhook_callback_url": "https://acme.privacy.cyera.io/api/v2/webhooks/callback",
    "privacy_request_id": "4b7a02e2-361e-4957-9d69-b381e3f47758",
    "integration_id": "4b7a02e2-361e-4957-9d69-b381e3f47758",
    "webhook_request_id": "3aa32ca6-e60d-4b71-981a-d1ba258fd712",
}
# The docs do not include a deletion sample; same shape with request_type deletion.
DELETION = {**ACCESS, "request_type": "deletion"}
HEALTH_CHECK = {
    "request_type": "health_check",
    "integration_name": "Webhook Integration",
    "integration_kind": "webhook",
    "webhook_request_id": "3aa32ca6-e60d-4b71-981a-d1ba258fd712",
}
OPT_OUT = {
    "request_type": "opt_out",
    "integration_name": "Webhook Integration",
    "integration_kind": "webhook",
    "topic": "opt_out:create",
    "identifiers": {"email": [{"email": "john@example.com"}]},
    "webhook_callback_url": "https://acme.privacy.cyera.io/api/v2/webhooks/callback",
    "opt_out_request_id": "206356d2-80de-492c-bd34-b0093b6f5d25",
    "integration_state_id": 123456789,
    "webhook_request_id": "9bfacff3-c454-4212-9417-88e246e1798f",
}
READINESS_CHECK = {
    "request_type": "readiness_check",
    "integration_name": "Webhook Integration",
    "integration_kind": "webhook",
    "identifiers": {"email": [{"email": "john@example.com"}]},
    "webhook_callback_url": "https://acme.privacy.cyera.io/api/v2/webhooks/callback",
    "privacy_request_id": "80edbafc-4ec6-45a0-b341-73080457890e",
    "integration_id": "7efa58a8-9b7d-4faf-8082-5f7f7f407db7",
    "webhook_request_id": "46093148-5087-423d-81b5-88c22701c642",
    "question": "Is the system ready to process this request?",
    "answers": ["Yes", "No"],
}


def now_seconds() -> str:
    return str(int(time.time()))


def sign(raw: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Same algorithm as Cyera: base64(HMAC-SHA256(secret, timestamp + ":" + body))."""
    digest = hmac.new(
        secret.encode("utf-8"), timestamp.encode("latin-1") + b":" + raw, hashlib.sha256
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def post(body, timestamp="auto", signature="auto", content_type="application/json"):
    if isinstance(body, bytes):
        raw = body
    elif isinstance(body, str):
        raw = body.encode("utf-8")
    else:
        raw = json.dumps(body).encode("utf-8")
    if timestamp == "auto":
        timestamp = now_seconds()
    if signature == "auto":
        signature = sign(raw, timestamp) if timestamp is not None else None

    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-webhook-signature"] = signature
    if timestamp is not None:
        headers["x-webhook-timestamp"] = timestamp
    return client.post("/webhooks/cyera", content=raw, headers=headers)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CYERA_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("CYERA_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestValidDeliveries:
    @pytest.mark.parametrize(
        "payload,status",
        [
            (ACCESS, 201),
            (DELETION, 201),
            (OPT_OUT, 201),
            (HEALTH_CHECK, 200),
            (READINESS_CHECK, 200),
        ],
        ids=["access", "deletion", "opt_out", "health_check", "readiness_check"],
    )
    def test_accepts_signed_request(self, payload, status):
        assert post(payload).status_code == status

    def test_verifies_exact_bytes_not_reserialized_body(self):
        raw = '{\n  "request_type" : "health_check",\n  "note":"café ✓"\n}\n'.encode("utf-8")
        assert post(raw).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(HEALTH_CHECK, content_type="text/plain").status_code == 200

    def test_acknowledges_unknown_request_types(self):
        assert post({"request_type": "something_new"}).status_code == 200


class TestRejections:
    RAW = json.dumps(HEALTH_CHECK).encode("utf-8")

    def test_missing_signature(self):
        assert post(HEALTH_CHECK, signature=None).status_code == 401

    def test_empty_signature(self):
        assert post(HEALTH_CHECK, signature="").status_code == 401

    def test_missing_timestamp(self):
        res = post(self.RAW, timestamp=None, signature=sign(self.RAW, now_seconds()))
        assert res.status_code == 401

    def test_wrong_secret(self):
        ts = now_seconds()
        assert post(self.RAW, timestamp=ts, signature=sign(self.RAW, ts, "wrong_secret")).status_code == 401

    def test_tampered_body(self):
        ts = now_seconds()
        signed = json.dumps(ACCESS).encode("utf-8")
        tampered = json.dumps({**ACCESS, "topic": "privacy_request:delete"}).encode("utf-8")
        assert post(tampered, timestamp=ts, signature=sign(signed, ts)).status_code == 401

    def test_changed_timestamp(self):
        res = post(self.RAW, timestamp="1700000001", signature=sign(self.RAW, "1700000000"))
        assert res.status_code == 401

    def test_wrong_separator(self):
        ts = now_seconds()
        dotted = base64.b64encode(
            hmac.new(SECRET.encode(), f"{ts}.".encode() + self.RAW, hashlib.sha256).digest()
        ).decode()
        assert post(self.RAW, timestamp=ts, signature=dotted).status_code == 401

    def test_prefixed_signature(self):
        ts = now_seconds()
        assert post(self.RAW, timestamp=ts, signature=f"sha256={sign(self.RAW, ts)}").status_code == 401

    def test_hex_digest(self):
        ts = now_seconds()
        hex_digest = hmac.new(SECRET.encode(), ts.encode() + b":" + self.RAW, hashlib.sha256).hexdigest()
        assert post(self.RAW, timestamp=ts, signature=hex_digest).status_code == 401

    def test_unpadded_or_urlsafe_base64(self):
        ts = now_seconds()
        good = sign(self.RAW, ts)
        assert post(self.RAW, timestamp=ts, signature=good[:-1]).status_code == 401
        urlsafe = good.replace("+", "-").replace("/", "_") + "x"
        assert post(self.RAW, timestamp=ts, signature=urlsafe).status_code == 401

    def test_wrong_letter_case(self):
        ts = now_seconds()
        swapped = sign(self.RAW, ts).swapcase()
        assert post(self.RAW, timestamp=ts, signature=swapped).status_code == 401

    def test_garbage_characters(self):
        ts = now_seconds()
        sig = sign(self.RAW, ts)
        assert post(self.RAW, timestamp=ts, signature=sig[:20] + "!!" + sig[22:]).status_code == 401

    def test_trailing_newline_in_signature(self):
        ts = now_seconds()
        assert post(self.RAW, timestamp=ts, signature=sign(self.RAW, ts) + "\n").status_code == 401

    def test_empty_body_with_signature_for_other_body(self):
        ts = now_seconds()
        assert post(b"", timestamp=ts, signature=sign(b"{}", ts)).status_code == 401


class TestAfterVerification:
    def test_non_json_body_returns_400(self):
        assert post("not json").status_code == 400

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("CYERA_WEBHOOK_SECRET")
        assert post(HEALTH_CHECK).status_code == 500


class TestTimestampTolerance:
    OLD_TS = str(int(time.time()) - 3600)

    def test_old_timestamp_accepted_by_default(self):
        assert post(HEALTH_CHECK, timestamp=self.OLD_TS).status_code == 200

    def test_old_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("CYERA_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(HEALTH_CHECK, timestamp=self.OLD_TS).status_code == 401

    def test_fresh_timestamp_accepted_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("CYERA_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(HEALTH_CHECK).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("CYERA_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert post(HEALTH_CHECK, timestamp=self.OLD_TS).status_code == 200


class TestVerifyFunction:
    def test_valid(self):
        raw = json.dumps(ACCESS).encode("utf-8")
        valid, error = verify_cyera_signature(raw, sign(raw, "1700000000"), "1700000000", SECRET)
        assert valid is True and error is None

    def test_mismatch_returns_error(self):
        raw = json.dumps(ACCESS).encode("utf-8")
        valid, error = verify_cyera_signature(raw, sign(raw, "1700000000", "other"), "1700000000", SECRET)
        assert valid is False and error
