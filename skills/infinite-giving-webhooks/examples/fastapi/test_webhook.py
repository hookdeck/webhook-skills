import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "ig_test_signing_secret_for_tests"
os.environ["INFINITE_GIVING_WEBHOOK_SECRET"] = SECRET
os.environ.pop("INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, verify_infinite_giving_webhook  # noqa: E402

client = TestClient(app)

# Payloads as shown in Infinite Giving's webhook docs
DONATION_CREATED = {
    "id": "A1B2C3D4E",
    "event": "donation:created",
    "created_at": "2026-06-23T21:00:00.000Z",
    "data": {
        "id": "DON1234567",
        "object": "donation",
        "organization": {"id": "ORGABCDEFG", "name": "Example Nonprofit"},
        "type": "stock",
        "status": "pledged",
        "identifier": "AAPL",
        "quantity": 10,
        "tax_deductible_amount": None,
        "recognition": "public",
        "memo": None,
        "source": "Fidelity",
        "cancelation_reason": None,
        "campaign": {"id": "CAM1234567", "name": "Annual Fund"},
        "designation": None,
        "trade": None,
        "donor": {"first_name": "Jane", "last_name": "Donor", "email": "jane@example.com"},
        "created_at": "2026-06-23T21:00:00.000Z",
        "updated_at": "2026-06-23T21:00:00.000Z",
    },
}

DONATION_UPDATED = {
    "id": "F6G7H8I9J",
    "event": "donation:updated",
    "created_at": "2026-06-24T14:30:00.000Z",
    "data": {
        **DONATION_CREATED["data"],
        "status": "complete",
        "tax_deductible_amount": 2143.5,
        "trade": {
            "executed_at": "2026-06-24T13:00:00.000Z",
            "settled_at": "2026-06-24T14:00:00.000Z",
            "fill_price": 215.0,
            "fill_quantity": 10,
            "sec_fee": 0.02,
            "postedge_fee": 0,
            "liquidity_fee": 0,
            "orf_fee": 0,
            "nasd_fee": 0,
            "misc_fee": 0,
        },
        "updated_at": "2026-06-24T14:30:00.000Z",
    },
}


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly as Infinite Giving does: HMAC-SHA256 of `{timestamp}.{raw body}`."""
    return hmac.new(secret.encode(), timestamp.encode("latin-1") + b"." + body, hashlib.sha256).hexdigest()


def now_ts() -> str:
    return str(int(time.time()))


def post(body, headers, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode()
    return client.post(
        "/webhooks/infinite-giving",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


def signed_headers(body, timestamp=None):
    if isinstance(body, str):
        body = body.encode()
    timestamp = timestamp or now_ts()
    return {"X-IG-Timestamp": timestamp, "X-IG-Signature": f"sha256={sign(body, timestamp)}"}


@pytest.fixture(autouse=True)
def _reset_tolerance():
    os.environ.pop("INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS", None)
    yield
    os.environ.pop("INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS", None)


class TestWebhookEndpoint:
    def test_accepts_donation_created(self):
        body = json.dumps(DONATION_CREATED)
        headers = {**signed_headers(body), "X-IG-Event": "donation:created", "X-IG-Webhook-Id": "A1B2C3D4E"}
        res = post(body, headers)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_donation_updated(self):
        body = json.dumps(DONATION_UPDATED)
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_bare_digest(self):
        body = json.dumps(DONATION_CREATED)
        ts = now_ts()
        assert post(body, {"X-IG-Timestamp": ts, "X-IG-Signature": sign(body.encode(), ts)}).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = json.dumps(DONATION_CREATED)
        ts = now_ts()
        headers = {"X-IG-Timestamp": ts, "X-IG-Signature": f"sha256={sign(body.encode(), ts).upper()}"}
        assert post(body, headers).status_code == 200

    def test_verifies_exact_raw_bytes(self):
        body = '{ "id" : "X1", "event" : "donation:created",\n  "data" : {"id":"DON1"} }\n'
        assert post(body, signed_headers(body)).status_code == 200

    def test_works_with_any_content_type(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, signed_headers(body), "application/vnd.api+json").status_code == 200

    def test_accepts_unknown_events_after_verification(self):
        body = json.dumps({"id": "Z", "event": "donation:other", "data": {}})
        assert post(body, signed_headers(body)).status_code == 200

    def test_rejects_missing_signature(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, {"X-IG-Timestamp": now_ts()}).status_code == 401

    def test_rejects_missing_timestamp(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, {"X-IG-Signature": f"sha256={sign(body.encode(), now_ts())}"}).status_code == 401

    def test_rejects_empty_headers(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, {"X-IG-Timestamp": now_ts(), "X-IG-Signature": ""}).status_code == 401
        assert post(body, {"X-IG-Timestamp": "", "X-IG-Signature": f"sha256={sign(body.encode(), '')}"}).status_code == 401

    @pytest.mark.parametrize(
        "bad",
        ["sha256=abc", "sha256=" + "z" * 64, "sha256=" + "a" * 63, "sha256=" + "a" * 65, "sha256="],
    )
    def test_rejects_malformed_signatures(self, bad):
        body = json.dumps(DONATION_CREATED)
        assert post(body, {"X-IG-Timestamp": now_ts(), "X-IG-Signature": bad}).status_code == 401

    def test_rejects_mismatch(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, {"X-IG-Timestamp": now_ts(), "X-IG-Signature": "sha256=" + "0" * 64}).status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(DONATION_CREATED)
        ts = now_ts()
        headers = {"X-IG-Timestamp": ts, "X-IG-Signature": f"sha256={sign(body.encode(), ts, 'wrong')}"}
        assert post(body, headers).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(DONATION_CREATED)
        headers = signed_headers(body)
        assert post(body.replace("AAPL", "MSFT"), headers).status_code == 401

    def test_rejects_changed_timestamp(self):
        body = json.dumps(DONATION_CREATED)
        ts = now_ts()
        headers = {"X-IG-Timestamp": str(int(ts) + 1), "X-IG-Signature": f"sha256={sign(body.encode(), ts)}"}
        assert post(body, headers).status_code == 401

    def test_invalid_json_with_valid_signature_is_400(self):
        body = "not json"
        assert post(body, signed_headers(body)).status_code == 400

    def test_does_not_reject_old_timestamps_by_default(self):
        body = json.dumps(DONATION_CREATED)
        assert post(body, signed_headers(body, "1700000000")).status_code == 200

    def test_rejects_old_timestamps_when_tolerance_configured(self):
        os.environ["INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS"] = "300"
        body = json.dumps(DONATION_CREATED)
        assert post(body, signed_headers(body, "1700000000")).status_code == 401
        assert post(body, signed_headers(body)).status_code == 200


class TestVerifyFunction:
    def test_uses_timestamp_header_as_received_latin1(self):
        body = b'{"a":1}'
        ts = "17000é"
        valid, _ = verify_infinite_giving_webhook(body, ts, sign(body, ts), SECRET)
        assert valid

    def test_verifies_non_utf8_body(self):
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        ts = now_ts()
        valid, _ = verify_infinite_giving_webhook(body, ts, f"sha256={sign(body, ts)}", SECRET)
        assert valid

    def test_fails_without_secret(self):
        valid, _ = verify_infinite_giving_webhook(b"{}", now_ts(), "a" * 64, "")
        assert not valid
