import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Affonso signing secrets are 64-character hex strings, used as plain string keys
SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
os.environ["AFFONSO_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("AFFONSO_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def now() -> int:
    return int(time.time())


def sign(body: bytes, timestamp, secret=SECRET) -> str:
    """Matches Affonso: lowercase hex HMAC-SHA256 of '<timestamp>.<raw body>', no prefix."""
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def signed(body: bytes, timestamp=None, secret=SECRET) -> dict:
    ts = now() if timestamp is None else timestamp
    return {"X-Affonso-Timestamp": str(ts), "X-Affonso-Signature": sign(body, ts, secret)}


# Payloads follow the samples in Affonso's event docs
DATA = {
    "affiliate": {
        "affiliateId": "aff_xyz789", "affiliateProgramId": "prog_abc123", "trackingId": "john-doe",
        "status": "ACTIVE", "email": "john@example.com", "name": "John Doe",
        "externalUserId": "user_123", "metadata": {"plan": "pro"}, "groupId": "grp_abc123",
    },
    "referral": {
        "referralId": "ref_xyz789", "affiliateId": "aff_abc123", "affiliateProgramId": "prog_def456",
        "trackingId": "john-doe", "status": "CUSTOMER", "email": "customer@example.com",
        "customerId": "cus_stripe123", "ip": "192.168.1.1", "referrer": "https://blog.example.com/review",
    },
    "transaction": {
        "transactionId": "txn_xyz789", "referralId": "ref_abc123", "affiliateId": "aff_def456",
        "saleAmount": 99.0, "saleCurrency": "USD", "saleStatus": "COMPLETE", "commissionAmount": 29.7,
        "commissionCurrency": "USD", "commissionStatus": "PENDING", "incentiveType": "COMMISSION",
        "holdPeriodDays": 30, "invoiceId": None,
        "createdAt": "2024-01-15T10:30:00.000Z", "updatedAt": "2024-01-15T10:30:00.000Z",
    },
    "payout": {
        "payoutId": "pay_xyz789", "affiliateId": "aff_abc123", "affiliateProgramId": "prog_def456",
        "invoiceNumber": 1042, "amount": 250.0, "status": "COMPLETED", "isManagedPayout": True,
        "paidAt": "2024-01-15T14:00:00.000Z",
        "createdAt": "2024-01-15T10:30:00.000Z", "updatedAt": "2024-01-15T14:00:00.000Z",
    },
}


def event(event_type: str) -> bytes:
    return json.dumps({
        "id": "evt_abc123",
        "type": event_type,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "data": DATA.get(event_type.split(".")[0], {}),
    }).encode()


def post(body: bytes, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/affonso",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = event("transaction.created")
        res = post(body, signed(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_digest(self):
        body = event("transaction.created")
        h = signed(body)
        h["X-Affonso-Signature"] = h["X-Affonso-Signature"].upper()
        assert post(body, h).status_code == 200

    def test_verifies_exact_bytes_not_reserialised_body(self):
        body = (json.dumps(json.loads(event("payout.paid")), indent=4) + "\n").encode()
        assert post(body, signed(body)).status_code == 200

    def test_accepts_any_content_type(self):
        body = event("referral.lead")
        assert post(body, signed(body), content_type="text/plain").status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("transaction.paid")
        assert post(body, signed(body, secret="f" * 64)).status_code == 401

    def test_rejects_hex_decoded_secret(self):
        body = event("transaction.paid")
        assert post(body, signed(body, secret=bytes.fromhex(SECRET))).status_code == 401

    def test_rejects_tampered_body(self):
        res = post(event("transaction.paid"), signed(event("transaction.created")))
        assert res.status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event("transaction.created")
        h = signed(body)
        h["X-Affonso-Timestamp"] = str(now() + 1)
        assert post(body, h).status_code == 401

    def test_rejects_missing_signature_header(self):
        body = event("transaction.created")
        assert post(body, {"X-Affonso-Timestamp": str(now())}).status_code == 401

    def test_rejects_missing_timestamp_header(self):
        body = event("transaction.created")
        assert post(body, {"X-Affonso-Signature": signed(body)["X-Affonso-Signature"]}).status_code == 401

    def test_rejects_empty_signature_header(self):
        body = event("transaction.created")
        res = post(body, {"X-Affonso-Timestamp": str(now()), "X-Affonso-Signature": ""})
        assert res.status_code == 401

    @pytest.mark.parametrize("sig", [
        "garbage",
        "ab" * 31,
        "ab" * 33,
        "zz" * 32,
        "sha256=" + "ab" * 32,
        ",".join(["ab" * 32, "cd" * 32]),
    ])
    def test_rejects_malformed_signature_without_raising(self, sig):
        body = event("transaction.created")
        res = post(body, {"X-Affonso-Timestamp": str(now()), "X-Affonso-Signature": sig})
        assert res.status_code == 401

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("AFFONSO_WEBHOOK_SECRET")
        body = event("transaction.created")
        assert post(body, signed(body)).status_code == 500


class TestTimestampTolerance:
    OLD = now() - 3600

    def test_off_by_default(self):
        body = event("transaction.created")
        assert post(body, signed(body, timestamp=self.OLD)).status_code == 200

    def test_rejects_old_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("transaction.created")
        assert post(body, signed(body, timestamp=self.OLD)).status_code == 401

    def test_accepts_fresh_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("transaction.created")
        assert post(body, signed(body)).status_code == 200

    def test_rejects_non_numeric_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("transaction.created")
        assert post(body, signed(body, timestamp="yesterday")).status_code == 401

    @pytest.mark.parametrize("value", ["five minutes", "0"])
    def test_non_numeric_or_zero_is_off(self, monkeypatch, value):
        monkeypatch.setenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS", value)
        body = event("transaction.created")
        assert post(body, signed(body, timestamp=self.OLD)).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize("event_type", [
        "affiliate.created", "affiliate.confirmed", "referral.lead", "referral.converted",
        "transaction.created", "transaction.approved", "transaction.paid", "transaction.rejected",
        "payout.paid", "payout.failed",
    ])
    def test_handles_event(self, event_type, caplog):
        body = event(event_type)
        with caplog.at_level(logging.INFO, logger="affonso-webhooks"):
            res = post(body, signed(body))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_events(self, caplog):
        body = event("coupon.created")
        with caplog.at_level(logging.INFO, logger="affonso-webhooks"):
            res = post(body, signed(body))
        assert res.status_code == 200
        assert "Unhandled event: coupon.created" in caplog.text

    def test_rejects_validly_signed_non_json(self):
        body = b"not json"
        assert post(body, signed(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
