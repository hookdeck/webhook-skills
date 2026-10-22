import hashlib
import hmac
import json
import os
import re
import time

import pytest

# MoonPay webhook API keys look like wk_test_xxxxx and are used as a plain string
API_KEY = "wk_test_123"
os.environ["MOONPAY_WEBHOOK_API_KEY"] = API_KEY

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_moonpay_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, key: str = API_KEY, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    s = hmac.new(key.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},s={s}"


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["Moonpay-Signature-V2"] = header
    return client.post("/webhooks/moonpay", content=body, headers=headers)


EVENTS = [
    {"type": "transaction_created", "data": {"id": "tx_1", "status": "waitingPayment"}},
    {"type": "transaction_updated", "data": {"id": "tx_1", "status": "completed"}},
    {"type": "transaction_failed", "data": {"id": "tx_1", "status": "failed", "failureReason": "card_not_supported"}},
    {"type": "sell_transaction_created", "data": {"id": "stx_1", "status": "waitingForDeposit"}},
    {"type": "sell_transaction_updated", "data": {"id": "stx_1", "status": "completed"}},
    {"type": "sell_transaction_failed", "data": {"id": "stx_1", "status": "failed"}},
    {"type": "sell_transaction_requote_required", "data": {"id": "stx_1"}},
    {"type": "identity_check_updated", "data": {"id": "ic_1", "status": "completed"}},
    {
        "id": "evt_1",
        "type": "customer.identity_status_updated",
        "timestamp": "2026-01-01T00:00:00Z",
        "data": {"customerId": "cus_1", "status": "verified"},
    },
    {"type": "somethingNew", "data": {}},
]


class TestVerify:
    body = json.dumps(EVENTS[0])

    def test_valid_signature(self):
        assert verify_moonpay_webhook(self.body.encode(), sign(self.body), API_KEY)

    def test_documented_header_shape(self):
        assert re.fullmatch(r"t=\d+,s=[0-9a-f]{64}", sign(self.body))

    def test_wrong_key(self):
        assert not verify_moonpay_webhook(self.body.encode(), sign(self.body, "wk_test_other"), API_KEY)

    def test_tampered_body(self):
        assert not verify_moonpay_webhook((self.body + " ").encode(), sign(self.body), API_KEY)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        # Retries and replays (including Hookdeck's) keep the original t
        monkeypatch.delenv("MOONPAY_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_moonpay_webhook(self.body.encode(), sign(self.body, t=old), API_KEY)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_moonpay_webhook(self.body.encode(), sign(self.body, t=old), API_KEY, tolerance=300)

    def test_old_timestamp_rejected_when_env_set(self, monkeypatch):
        monkeypatch.setenv("MOONPAY_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_moonpay_webhook(self.body.encode(), sign(self.body, t=old), API_KEY)

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("MOONPAY_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_moonpay_webhook(self.body.encode(), sign(self.body, t=old), API_KEY)

    def test_wider_tolerance_accepts_stale(self):
        old = int(time.time()) - 600
        assert verify_moonpay_webhook(self.body.encode(), sign(self.body, t=old), API_KEY, tolerance=900)

    @pytest.mark.parametrize("header", ["garbage", "t=abc,s=00", f"t={int(time.time())}", None])
    def test_malformed_header(self, header):
        assert not verify_moonpay_webhook(self.body.encode(), header, API_KEY)


class TestEndpoint:
    @pytest.mark.parametrize("event", EVENTS, ids=[e["type"] for e in EVENTS])
    def test_valid_events(self, event):
        body = json.dumps(event)
        assert post(body, sign(body)).status_code == 200

    def test_non_json_content_type_still_verifies(self):
        body = json.dumps(EVENTS[0])
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_invalid_signature(self):
        body = json.dumps(EVENTS[0])
        assert post(body, sign(body, "wk_test_wrong")).status_code == 400

    def test_missing_header(self):
        assert post(json.dumps(EVENTS[0])).status_code == 400

    def test_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
