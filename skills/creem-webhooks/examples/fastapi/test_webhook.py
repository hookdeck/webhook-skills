import hashlib
import hmac
import json
import os
import secrets

# Set test environment variables before importing the app
os.environ["CREEM_WEBHOOK_SECRET"] = "whsec_test_creem_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_creem_signature

client = TestClient(app)

SECRET = os.environ["CREEM_WEBHOOK_SECRET"]

EVENTS = [
    "checkout.completed",
    "subscription.active",
    "subscription.paid",
    "subscription.canceled",
    "subscription.scheduled_cancel",
    "subscription.past_due",
    "subscription.unpaid",
    "subscription.expired",
    "subscription.update",
    "subscription.trialing",
    "subscription.paused",
    "refund.created",
    "dispute.created",
    "credits.granted",
    "credits.consumed",
    "credits.auto_recharged",
    "customer_credits.exhausted",
    "something.else",
]


def sample_payload(event_type="checkout.completed"):
    """Shape follows Creem's documented samples: top-level id (evt_...), eventType, created_at
    and the resource under `object`."""
    return {
        "id": "evt_5WHHcZPv7VS0YUsberIuOz",
        "eventType": event_type,
        "created_at": 1728734325927,
        "object": {"id": "ch_4l0N34kxo16AhRKUHFUuXr", "object": "checkout", "status": "completed"},
    }


def sign(body, secret=SECRET):
    """creem-signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body=None, signature=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    headers = {"content-type": content_type}
    if signature is not None:
        headers["creem-signature"] = signature
    return client.post("/webhooks/creem", content=body, headers=headers)


class TestCreemWebhook:
    def test_accepts_valid_signature(self):
        body = json.dumps(sample_payload())
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body).upper()).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_verifies_exact_bytes_received(self):
        body = '{ "eventType" :   "checkout.completed" }\n'
        assert post(body, sign(body)).status_code == 200

    def test_rejects_wrong_secret(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        signed = json.dumps(sample_payload())
        tampered = json.dumps(sample_payload("refund.created"))
        assert post(tampered, sign(signed)).status_code == 401

    def test_rejects_random_64_hex_signature(self):
        assert post(signature=secrets.token_hex(32)).status_code == 401

    def test_rejects_missing_signature(self):
        assert post().status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(sample_payload())
        good = sign(body)
        for bad in ["abc", good[:62], good + "00", "z" * 64, f"sha256={good}"]:
            assert post(body, bad).status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        body = json.dumps(sample_payload())
        res = client.post(
            "/webhooks/creem",
            content=body,
            headers={"content-type": "application/json", "creem-signature": ("é" * 64).encode("utf-8")},  # httpx needs bytes for non-ASCII
        )
        assert res.status_code == 401

    def test_invalid_json_after_valid_signature_is_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_json_array_is_400(self):
        assert post("[1,2]", sign("[1,2]")).status_code == 400

    @pytest.mark.parametrize("event_name", EVENTS)
    def test_handles_event(self, event_name):
        body = json.dumps(sample_payload(event_name))
        assert post(body, sign(body)).status_code == 200


class TestVerifyCreemSignature:
    body = json.dumps(sample_payload()).encode()

    def test_accepts_matching_signature(self):
        assert verify_creem_signature(self.body, sign(self.body), SECRET) is True

    def test_rejects_when_no_secret_configured(self, monkeypatch):
        monkeypatch.delenv("CREEM_WEBHOOK_SECRET")
        assert verify_creem_signature(self.body, sign(self.body)) is False
        assert verify_creem_signature(self.body, sign(self.body, ""), "") is False

    def test_rejects_missing_or_non_string_signature(self):
        assert verify_creem_signature(self.body, None, SECRET) is False
        assert verify_creem_signature(self.body, b"abc", SECRET) is False

    def test_non_ascii_signature_returns_false(self):
        assert verify_creem_signature(self.body, "é" * 64, SECRET) is False
