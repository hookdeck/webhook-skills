import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Pennylane's subscription secret is an opaque string used as-is; this one is only for tests
SECRET = "test_pennylane_secret_8f3a1c"
os.environ["PENNYLANE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_pennylane  # noqa: E402

client = TestClient(app)


def v1_for(body: str, timestamp: int, secret=SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={v1_for(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Pennylane-Signature"] = signature
    return client.post("/webhooks/pennylane", content=body, headers=headers)


def envelope(event, obj, previous=None) -> str:
    data = {"context": {"company_id": 12345, "firm_id": 678}, "object": obj}
    if previous is not None:
        data["previous_attributes"] = previous
    return json.dumps({"id": 987654, "event": event, "retry_count": 0, "created": 1657875952, "data": data})


INVOICE_UPDATED = envelope(
    "customer_invoice.e_invoicing_status_updated",
    {"id": 555001, "e_invoicing": {"status": "accepted"}},
    {"e_invoicing": {"status": "submitted"}},
)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(INVOICE_UPDATED, sign(INVOICE_UPDATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED), "text/plain").status_code == 200

    def test_allows_space_after_comma_and_uppercase_hex(self):
        ts = int(time.time())
        header = f"t={ts}, v1={v1_for(INVOICE_UPDATED, ts).upper()}"
        assert post(INVOICE_UPDATED, header).status_code == 200

    def test_accepts_when_any_v1_matches(self):
        ts = int(time.time())
        stale = v1_for(INVOICE_UPDATED, ts, "old_secret")
        fresh = v1_for(INVOICE_UPDATED, ts)
        assert post(INVOICE_UPDATED, f"t={ts},v1={stale},v1={fresh}").status_code == 200
        assert post(INVOICE_UPDATED, f"t={ts},v1={fresh},v1={stale}").status_code == 200

    def test_rejects_when_no_v1_matches(self):
        ts = int(time.time())
        header = f"t={ts},v1={v1_for(INVOICE_UPDATED, ts, 'a')},v1={v1_for(INVOICE_UPDATED, ts, 'b')}"
        assert post(INVOICE_UPDATED, header).status_code == 400

    def test_rejects_missing_header(self):
        assert post(INVOICE_UPDATED).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(INVOICE_UPDATED.replace("accepted", "refused"), sign(INVOICE_UPDATED)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED, secret="other_secret")).status_code == 400

    def test_rejects_v1_of_wrong_length(self):
        assert post(INVOICE_UPDATED, "t=1700000000,v1=abc").status_code == 400

    def test_rejects_non_ascii_v1_without_error(self):
        # compare_digest raises TypeError on non-ASCII str, so the code compares bytes
        assert verify_pennylane(b"{}", "t=1700000000,v1=" + "é" * 32, SECRET) is False
        assert verify_pennylane(b"{}", "t=1700000000,v1=" + "日本語" * 8, SECRET) is False
        res = client.post(
            "/webhooks/pennylane",
            content=INVOICE_UPDATED,
            # httpx only sends non-ASCII header values as bytes; servers decode them as latin-1
            headers={"X-Pennylane-Signature": ("t=1700000000,v1=" + "é" * 32).encode("latin-1")},
        )
        assert res.status_code == 400

    def test_rejects_header_without_t_or_v1(self):
        ts = int(time.time())
        assert post(INVOICE_UPDATED, f"v1={v1_for(INVOICE_UPDATED, ts)}").status_code == 400
        assert post(INVOICE_UPDATED, f"t={ts}").status_code == 400
        assert post(INVOICE_UPDATED, "garbage").status_code == 400

    def test_rejects_altered_timestamp(self):
        header = sign(INVOICE_UPDATED, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(INVOICE_UPDATED, header).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        # Hookdeck retries and replays keep the original timestamp
        old = int(time.time()) - 3600
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED, old)).status_code == 400
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(INVOICE_UPDATED, sign(INVOICE_UPDATED, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event,obj,expected", [
        ("customer_invoice.e_invoicing_status_updated", {"id": 1, "e_invoicing": {"status": "sent"}}, "e-invoicing status"),
        ("dms_file.created", {"id": 2, "created_at": "2024-01-01T00:00:00Z"}, "DMS file 2 created"),
        ("supplier_invoice.e_invoicing_received", {"id": 3, "created_at": "2024-01-01T00:00:00Z"}, "Supplier invoice 3"),
    ])
    def test_dispatch(self, caplog, event, obj, expected):
        body = envelope(event, obj)
        with caplog.at_level(logging.INFO, logger="pennylane-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        assert expected in caplog.text
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unknown_event(self, caplog):
        body = envelope("customer_invoice.created", {"id": 9})
        with caplog.at_level(logging.INFO, logger="pennylane-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: customer_invoice.created" in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400
