import base64
import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# The signing_key is whatever string you set on the RootFi webhook config; RootFi does not
# generate one. The whole string, as UTF-8, is the HMAC key. This one is only for tests.
SECRET = "rf_whsk_3f9a1c7e5b2d4a60"
os.environ["ROOTFI_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def v1_for(body, t, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    data = body if isinstance(body, bytes) else body.encode()
    return hmac.new(key, f"{t}.".encode() + data, hashlib.sha256).hexdigest()


def sign(body, t=None, secret=SECRET) -> str:
    t = int(time.time()) if t is None else t
    return f"t={t},v1={v1_for(body, t, secret)}"


def post(body, signature=None, content_type="application/json", extra=None):
    headers = {"Content-Type": content_type, **(extra or {})}
    if signature is not None:
        headers["X-RootFi-Signature"] = signature
    # encode header values as UTF-8 so non-ASCII headers can be tested
    raw_headers = [(k.lower().encode(), v.encode("utf-8")) for k, v in headers.items()]
    content = body if isinstance(body, bytes) else body.encode()
    return client.post("/webhooks/rootfi", content=content, headers=raw_headers)


# Payloads as shown in RootFi's webhook docs
SAMPLES = {
    "DATA_MODEL_CHANGES": {"event": "DATA_MODEL_CHANGES", "data": {"company_id": 1234, "integration_type": "XERO", "data_model": "INVOICE", "type": "CREATE", "job_id": "amiKRBIQ1khvk6B", "sync_id": "pt21IJtaATVZJ5v", "no_of_records": 2, "records": [{"platform_id": "3124930487"}, {"platform_id": "3147384833"}]}},
    "SYNC_STARTED": {"event": "SYNC_STARTED", "data": {"sync_id": "pt21IJtaATVZJ5v", "company_id": 1234, "integration_type": "XERO", "data_models": ["INVOICE", "CONTACT"], "full_sync": False}},
    "SYNC_COMPLETED": {"event": "SYNC_COMPLETED", "data": {"id": "pt21IJtaATVZJ5v", "sync_id": "pt21IJtaATVZJ5v", "type": "PULL", "status": "SUCCESS", "start_time": "2024-05-16T11:27:22.000Z", "end_time": "2024-05-16T11:27:38.743Z", "total_jobs_count": 15, "success_jobs_count": 15, "failed_jobs_count": 0, "running_jobs_count": 0, "created_jobs_count": 0, "data_models": ["INVOICE", "CONTACT"], "company_id": 1234, "integration_type": "XERO"}},
    "CONNECTION_CHANGED": {"event": "CONNECTION_CHANGED", "data": {"connection_id": "1234_XERO", "company_id": 1234, "integration_type": "XERO", "status": "HEALTHY"}},
    "DISCONNECT_REQUESTED": {"event": "DISCONNECT_REQUESTED", "data": {"disconnect_request_id": 42, "connection_id": "1234_XERO", "company_id": 1234, "integration_type": "XERO"}},
}
SYNC_COMPLETED = json.dumps(SAMPLES["SYNC_COMPLETED"])


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(SYNC_COMPLETED, sign(SYNC_COMPLETED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED), "text/plain").status_code == 200

    def test_verifies_exact_bytes_received(self):
        body = '{\n  "event":   "CONNECTION_CHANGED",\n  "data": {"status": "HEALTHY", "name": "Café ☕"}\n}\n'
        assert post(body, sign(body)).status_code == 200
        # Re-serialized JSON is a different byte sequence and must not verify
        reserialized = json.dumps(json.loads(body))
        assert post(reserialized, sign(body)).status_code == 401

    def test_verifies_bytes_that_are_not_valid_utf8(self):
        body = b'{"event":"SYNC_STARTED","data":{"x":"\xff\xfe"}}'
        header = sign(body)
        # Verified over the untouched bytes; JSON decoding happens only after the check
        res = post(body, header, "application/octet-stream")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"
        # A decoded-and-re-encoded copy has different bytes and must not verify
        lossy = body.decode("utf-8", errors="replace").encode()
        assert post(lossy, header, "application/octet-stream").status_code == 401

    def test_uses_t_exactly_as_in_header(self):
        # A leading zero would be lost if t were parsed to an int and formatted again
        t = "01716035258"
        assert post(SYNC_COMPLETED, f"t={t},v1={v1_for(SYNC_COMPLETED, t)}").status_code == 200
        assert post(SYNC_COMPLETED, f"t=1716035258,v1={v1_for(SYNC_COMPLETED, t)}").status_code == 401

    def test_uses_signing_key_as_plain_utf8(self, monkeypatch):
        key = os.urandom(16).hex()
        monkeypatch.setenv("ROOTFI_WEBHOOK_SECRET", key)
        t = int(time.time())
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, t, key)).status_code == 200
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, t, bytes.fromhex(key))).status_code == 401
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, t, base64.b64decode(key))).status_code == 401

    def test_allows_space_after_comma(self):
        t = int(time.time())
        assert post(SYNC_COMPLETED, f"t={t}, v1={v1_for(SYNC_COMPLETED, t)}").status_code == 200

    def test_accepts_when_any_v1_matches_and_ignores_v0(self):
        t = int(time.time())
        old = v1_for(SYNC_COMPLETED, t, "rf_old_signing_key")
        good = v1_for(SYNC_COMPLETED, t)
        assert post(SYNC_COMPLETED, f"t={t},v1={old},v1={good}").status_code == 200
        assert post(SYNC_COMPLETED, f"t={t},v1={good},v1={old}").status_code == 200
        assert post(SYNC_COMPLETED, f"t={t},v0={good},v1={good}").status_code == 200
        assert post(SYNC_COMPLETED, f"t={t},v0={good}").status_code == 401
        assert post(SYNC_COMPLETED, f"t={t},v1={old},v1={old[:-1]}0").status_code == 401

    def test_accepts_uppercase_hex(self):
        t = int(time.time())
        assert post(SYNC_COMPLETED, f"t={t},v1={v1_for(SYNC_COMPLETED, t).upper()}").status_code == 200

    def test_rejects_missing_or_empty_header(self):
        assert post(SYNC_COMPLETED, None).status_code == 401
        assert post(SYNC_COMPLETED, "").status_code == 401

    def test_rejects_tampered_body(self):
        assert post(SYNC_COMPLETED.replace("SUCCESS", "FAILED"), sign(SYNC_COMPLETED)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, secret="rf_other_key")).status_code == 401

    def test_rejects_bad_v1_without_error(self):
        t = 1716035258
        assert post(SYNC_COMPLETED, f"t={t},v1=abc").status_code == 401
        assert post(SYNC_COMPLETED, f"t={t},v1={'zz' * 32}").status_code == 401
        assert post(SYNC_COMPLETED, f"t={t},v1={'a' * 63}g").status_code == 401
        assert post(SYNC_COMPLETED, f"t={t},v1={'a' * 66}").status_code == 401
        # non-ASCII header value: rejected by the format check, not a 500
        assert post(SYNC_COMPLETED, f"t={t},v1={'é' * 64}").status_code == 401

    def test_rejects_headers_without_t_or_v1(self):
        t = int(time.time())
        assert post(SYNC_COMPLETED, f"v1={v1_for(SYNC_COMPLETED, t)}").status_code == 401
        assert post(SYNC_COMPLETED, f"t={t}").status_code == 401
        assert post(SYNC_COMPLETED, f"t=,v1={v1_for(SYNC_COMPLETED, '')}").status_code == 401
        assert post(SYNC_COMPLETED, "garbage").status_code == 401

    def test_rejects_altered_timestamp(self):
        header = sign(SYNC_COMPLETED, 1716035258).replace("t=1716035258", "t=1716035259")
        assert post(SYNC_COMPLETED, header).status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("ROOTFI_WEBHOOK_SECRET")
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED)).status_code == 500

    def test_accepts_old_timestamp_by_default(self):
        old = int(time.time()) - 3600
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("ROOTFI_WEBHOOK_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, old)).status_code == 401
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("ROOTFI_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(SYNC_COMPLETED, sign(SYNC_COMPLETED, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("name", [*SAMPLES, "SOMETHING_NEW"])
    def test_dispatches_on_event_field(self, name, caplog):
        body = json.dumps(SAMPLES.get(name) or {"event": name, "data": {}})
        with caplog.at_level(logging.INFO, logger="rootfi-webhooks"):
            res = post(body, sign(body), extra={"X-RootFi-Webhook-Delivery-Id": "dlv_123"})
        assert res.status_code == 200
        logged = "\n".join(r.getMessage() for r in caplog.records)
        if name in SAMPLES:
            assert "Unhandled" not in logged
            assert "dlv_123" in logged
        else:
            assert f"Unhandled event: {name}" in logged

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
