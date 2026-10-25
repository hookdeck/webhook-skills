import hashlib
import hmac
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Certn's signing secret is used as-is, as UTF-8; this one is only for tests
SECRET = "test_certn_signing_secret_3b7d"
os.environ["CERTN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def v1_for(body: str, timestamp: int, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


# Certn puts a space after each comma: t=<ts>, v1=<hex>
def sign(body: str, timestamp=None, secret: str = SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts}, v1={v1_for(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Certn-Signature"] = signature
    return client.post("/webhooks/certn", content=body, headers=headers)


COMPLETE = (
    '{"id": "1ba124f1-d473-44c0-a066-d623b2cb6253", "applicant_type": "Standard", '
    '"report_status": "COMPLETE", "result": "CLEARED", "result_label": "Cleared", '
    '"check_executions": [{"id": "check_exec_SYS5AS3GLcZZpo0i1GfNXQ", '
    '"check_name": "criminal_record_check", "status": "COMPLETE"}]}'
)
IN_PROGRESS = '{"id": "a1", "report_status": "IN_PROGRESS", "result": "NONE"}'


@pytest.fixture(autouse=True)
def clear_tolerance(monkeypatch):
    monkeypatch.delenv("CERTN_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        r = post(COMPLETE, sign(COMPLETE))
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_accepts_header_without_space_after_comma(self):
        t = int(time.time())
        assert post(COMPLETE, f"t={t},v1={v1_for(COMPLETE, t)}").status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post(COMPLETE, sign(COMPLETE), "text/plain").status_code == 200

    def test_accepts_when_any_v1_matches(self):
        t = int(time.time())
        header = f"t={t}, v1={v1_for(COMPLETE, t, 'old_secret')}, v1={v1_for(COMPLETE, t)}"
        assert post(COMPLETE, header).status_code == 200

    def test_ignores_other_schemes(self):
        t = int(time.time())
        assert post(COMPLETE, f"t={t}, v0={v1_for(COMPLETE, t)}").status_code == 400

    def test_rejects_missing_header(self):
        assert post(COMPLETE).status_code == 400

    def test_rejects_missing_t_or_v1(self):
        t = int(time.time())
        assert post(COMPLETE, f"v1={v1_for(COMPLETE, t)}").status_code == 400
        assert post(COMPLETE, f"t={t}").status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(COMPLETE, sign(COMPLETE, secret="wrong_secret")).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(COMPLETE.replace("CLEARED", "NONE"), sign(COMPLETE)).status_code == 400

    def test_rejects_malformed_v1_without_error(self):
        t = int(time.time())
        assert post(COMPLETE, f"t={t}, v1=zz{'zz' * 31}").status_code == 400
        assert post(COMPLETE, f"t={t}, v1=abcd").status_code == 400

    def test_non_ascii_header_is_400_not_500(self):
        t = int(time.time())
        r = client.post(
            "/webhooks/certn",
            content=COMPLETE,
            headers={"Content-Type": "application/json", "Certn-Signature": f"t={t}, v1=é".encode("latin-1")},
        )
        assert r.status_code == 400

    def test_accepts_uppercase_hex(self):
        t = int(time.time())
        assert post(COMPLETE, f"t={t}, v1={v1_for(COMPLETE, t).upper()}").status_code == 200

    def test_accepts_old_timestamp_by_default(self):
        assert post(COMPLETE, sign(COMPLETE, int(time.time()) - 86400)).status_code == 200

    def test_rejects_old_timestamp_when_window_opted_in(self, monkeypatch):
        monkeypatch.setenv("CERTN_TIMESTAMP_TOLERANCE_SECONDS", "300")
        assert post(COMPLETE, sign(COMPLETE, int(time.time()) - 3600)).status_code == 400
        assert post(COMPLETE, sign(COMPLETE)).status_code == 200

    def test_invalid_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("CERTN_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        assert post(COMPLETE, sign(COMPLETE, int(time.time()) - 3600)).status_code == 200

    def test_invalid_json_with_valid_signature_is_400(self):
        assert post("not json", sign("not json")).status_code == 400


class TestDispatch:
    def test_complete(self, caplog):
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(COMPLETE, sign(COMPLETE))
        assert "report complete: result CLEARED" in caplog.text

    def test_in_progress(self, caplog):
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(IN_PROGRESS, sign(IN_PROGRESS))
        assert "report in progress" in caplog.text

    def test_unknown_status_acknowledged(self, caplog):
        body = '{"id": "x", "report_status": "SOMETHING_NEW"}'
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            r = post(body, sign(body))
        assert r.status_code == 200
        assert "Unhandled report_status: SOMETHING_NEW" in caplog.text

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
