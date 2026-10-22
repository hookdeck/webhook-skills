import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Wave doesn't document a secret format; this one is only for tests
SECRET = "test_wave_webhook_secret_5f2a91c4"
os.environ["WAVE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, timestamp=None, secret=SECRET) -> dict:
    ts = int(time.time()) if timestamp is None else timestamp
    v1 = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return {"x-wave-signature": f"t={ts},v1={v1}", "x-wave-timestamp": str(ts)}


def post(body: str, headers: dict, content_type="application/json"):
    return client.post(
        "/webhooks/wave",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


@pytest.fixture(autouse=True)
def clean_tolerance(monkeypatch):
    monkeypatch.delenv("WAVE_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


PAID = json.dumps({
    "business_id": "63c77f29-875c-4cdc-947d-07430f628043",
    "data": {
        "amount_paid": "8.98",
        "currency_code": "USD",
        "customer_id": "21840161",
        "invoice_id": "2496756670638588934",
        "paid_date": "2026-04-29",
        "remaining_balance": "0.00",
    },
    "event_id": "2f210c44-f1ab-551e-89fa-333fb8d2a5fe",
    "event_type": "invoice.paid",
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(PAID, sign(PAID))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_any_content_type(self):
        assert post(PAID, sign(PAID), "text/plain").status_code == 200

    def test_rejects_tampered_body(self):
        assert post(PAID.replace("8.98", "9999.00"), sign(PAID)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(PAID, sign(PAID, secret="other_secret")).status_code == 400

    def test_rejects_missing_header(self):
        assert post(PAID, {}).status_code == 400

    def test_rejects_malformed_header(self):
        assert post(PAID, {"x-wave-signature": "garbage"}).status_code == 400
        assert post(PAID, {"x-wave-signature": "t=abc,v1=deadbeef"}).status_code == 400

    def test_rejects_signature_of_different_length(self):
        assert post(PAID, {"x-wave-signature": f"t={int(time.time())},v1=abc"}).status_code == 400

    def test_rejects_timestamp_altered_after_signing(self):
        sig = sign(PAID)["x-wave-signature"]
        forged = "t=" + str(int(time.time()) + 1) + sig[sig.index(","):]
        assert post(PAID, {"x-wave-signature": forged}).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        old = int(time.time()) - 3600
        assert post(PAID, sign(PAID, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("WAVE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(PAID, sign(PAID, old)).status_code == 400
        assert post(PAID, sign(PAID)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("WAVE_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(PAID, sign(PAID, old)).status_code == 200

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400


class TestEvents:
    @pytest.mark.parametrize("event_type,data", [
        ("invoice.sent", {"invoice_id": "1", "customer_id": "2", "sent_method": "WAVE"}),
        ("invoice.viewed", {"invoice_id": "1", "customer_id": "2"}),
        ("invoice.paid", {"invoice_id": "1", "amount_paid": "8.98", "currency_code": "USD"}),
        ("invoice.partially_paid", {"invoice_id": "1", "remaining_balance": "30.00"}),
        ("invoice.overdue", {"invoice_id": "1", "invoice_balance": "200.00"}),
        ("invoice.approved", {"invoice_id": "1", "amount": "200.00"}),
        ("estimate.sent", {"estimate_id": "3", "status": "sent"}),
        ("estimate.accepted", {"estimate_id": "3", "status": "accepted"}),
        ("checkout.paid", {"checkout_id": "4", "amount": "200.00", "currency_code": "USD"}),
        ("estimate.expired", {"estimate_id": "3"}),
    ])
    def test_handles_event(self, event_type, data):
        body = json.dumps({"event_id": "e1", "event_type": event_type, "business_id": "b1", "data": data})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
