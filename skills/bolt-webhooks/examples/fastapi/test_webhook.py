import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Bolt Signing Secret is an arbitrary raw string (used as-is, not decoded)
SECRET = "test_bolt_signing_secret"
os.environ["BOLT_SIGNING_SECRET"] = SECRET

from main import app, verify_bolt_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Bolt: base64(HMAC-SHA256(raw_body, signing_secret)) in X-Bolt-Hmac-Sha256."""
    return base64.b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).decode()


def post(payload: bytes, signature: str = None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Bolt-Hmac-Sha256"] = signature
    return client.post("/webhooks/bolt", content=payload, headers=headers)


class TestVerify:
    body = b'{"type":"payment"}'

    def test_valid(self):
        assert verify_bolt_webhook(self.body, sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_bolt_webhook(self.body, sign(self.body, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_bolt_webhook(b'{"type":"void"}', sign(self.body), SECRET)

    def test_garbage(self):
        assert not verify_bolt_webhook(self.body, "abc", SECRET)


class TestWebhookEndpoint:
    def test_missing_signature(self):
        assert post(b'{"type":"payment"}').status_code == 400

    def test_invalid_signature(self):
        res = post(b'{"type":"payment"}', "invalid")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    @pytest.mark.parametrize("event_type", [
        "pending", "payment", "auth", "capture", "credit", "void",
        "failed_payment", "rejected_irreversible", "rejected_reversible",
        "risk_insights", "newsletter_subscription",
    ])
    def test_signed_transaction_events(self, event_type):
        payload = json.dumps({
            "type": event_type,
            "object": "transaction",
            "data": {"id": "T1c3p4yBuVYJ9", "reference": "LBLJ-TWW7-R9VC", "status": "completed"},
        }).encode()
        res = post(payload, sign(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_credit_card_deleted(self):
        payload = json.dumps({
            "type": "credit_card_deleted",
            "object": "credit_card",
            "data": {"user": {"id": "b2vghjk2v4c5fgdh3jak"}, "credit_card": {}},
        }).encode()
        assert post(payload, sign(payload)).status_code == 200

    def test_unknown_event_acknowledged(self):
        payload = json.dumps({"type": "subscription_created", "object": "subscription", "data": {}}).encode()
        assert post(payload, sign(payload)).status_code == 200

    def test_signed_non_json_rejected(self):
        payload = b"not json"
        assert post(payload, sign(payload)).status_code == 400
