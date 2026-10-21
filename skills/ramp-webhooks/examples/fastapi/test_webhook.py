import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Ramp returns the secret as a raw string; it is used as-is (not decoded)
os.environ["RAMP_WEBHOOK_SECRET"] = "test_ramp_webhook_secret"

from main import app, verify_ramp_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["RAMP_WEBHOOK_SECRET"]


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like Ramp: hex(HMAC-SHA256(secret, rawBody))."""
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


CLEARED_EVENT = {
    "id": "evt_0b1c2d3e",
    "type": "transactions.cleared",
    "created_at": "2026-10-21T10:15:00Z",
    "business_id": "biz_123",
    "object": {"id": "a1b2c3d4-0000-0000-0000-000000000001"},
}


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Ramp-Signature"] = signature
    return client.post("/webhooks/ramp", content=body, headers=headers)


class TestVerifyRampSignature:
    def test_accepts_valid_signature(self):
        body = json.dumps(CLEARED_EVENT)
        assert verify_ramp_signature(body.encode(), sign(body), SECRET)

    def test_digest_is_64_char_hex(self):
        assert len(sign("{}")) == 64

    def test_rejects_tampered_body(self):
        body = json.dumps(CLEARED_EVENT)
        assert not verify_ramp_signature((body + " ").encode(), sign(body), SECRET)

    def test_rejects_wrong_secret(self):
        body = json.dumps(CLEARED_EVENT)
        assert not verify_ramp_signature(body.encode(), sign(body, "other"), SECRET)

    def test_rejects_wrong_length(self):
        assert not verify_ramp_signature(b"{}", "abcd", SECRET)

    def test_rejects_missing_values(self):
        assert not verify_ramp_signature(b"{}", None, SECRET)
        assert not verify_ramp_signature(b"{}", sign("{}"), None)


class TestWebhookEndpoint:
    def test_accepts_cleared_event(self):
        body = json.dumps(CLEARED_EVENT)
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_verification_challenge(self):
        body = json.dumps({"type": "webhooks.verification", "challenge": "challenge_abc123"})
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "transactions.authorized",
            "transactions.declined",
            "reimbursements.ready_for_review",
            "bills.created",
            "bills.approved",
            "bills.paid",
            "tests.test_event",
            "vendors.updated",
        ],
    )
    def test_accepts_event_types(self, event_type):
        body = json.dumps({**CLEARED_EVENT, "type": event_type})
        assert post(body, sign(body)).status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(CLEARED_EVENT)).status_code == 400

    def test_rejects_invalid_signature(self):
        body = json.dumps(CLEARED_EVENT)
        assert post(body, sign(body, "wrong_secret")).status_code == 400

    def test_rejects_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_verifies_exact_raw_bytes(self):
        body = '{ "id":"evt_1",  "type":"bills.paid", "object":{"id":"x"} }'
        assert post(body, sign(body)).status_code == 200
