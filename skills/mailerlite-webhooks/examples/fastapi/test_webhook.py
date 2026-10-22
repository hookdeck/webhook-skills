import os
import hmac
import hashlib
import json

# MailerLite secrets are short per-webhook strings (e.g. "ybmcD7PQ9R"), used as UTF-8
os.environ["MAILERLITE_WEBHOOK_SECRET"] = "ybmcD7PQ9R"

from fastapi.testclient import TestClient
from main import app, verify_mailerlite_webhook

client = TestClient(app)
SECRET = os.environ["MAILERLITE_WEBHOOK_SECRET"]


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Generate a valid MailerLite signature: bare hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


SUBSCRIBER_CREATED = json.dumps({
    "id": "100000000000000000",
    "email": "john.doe@example.com",
    "status": "active",
    "event": "subscriber.created",
    "account_id": 0,
}).encode()

CAMPAIGN_SENT = json.dumps({
    "id": "100000000000000000",
    "name": "Campaign name",
    "total_recipients": 1000,
    "event": "campaign.sent",
    "account_id": 0,
}).encode()

BATCHED = json.dumps({
    "events": [
        {"type": "campaign.open", "subscriber": {"email": "a@example.com"}, "campaign": {"name": "C"}},
        {"type": "campaign.click", "subscriber": {"email": "b@example.com"}, "campaign": {"name": "C"}},
    ],
    "total": 2,
}).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["Signature"] = signature
    return client.post("/webhooks/mailerlite", content=body, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, sign(SUBSCRIBER_CREATED), SECRET) is True

    def test_wrong_secret(self):
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, sign(SUBSCRIBER_CREATED, "other"), SECRET) is False

    def test_modified_body(self):
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED + b" ", sign(SUBSCRIBER_CREATED), SECRET) is False

    def test_missing_or_malformed_signature(self):
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, None, SECRET) is False
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, "abc", SECRET) is False

    def test_prefixed_signature_rejected(self):
        # MailerLite sends bare hex, not "sha256=<hex>"
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, "sha256=" + sign(SUBSCRIBER_CREATED), SECRET) is False

    def test_non_ascii_signature_does_not_raise(self):
        assert verify_mailerlite_webhook(SUBSCRIBER_CREATED, "é" * 64, SECRET) is False


class TestEndpoint:
    def test_subscriber_created(self):
        res = post(SUBSCRIBER_CREATED, sign(SUBSCRIBER_CREATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_campaign_sent(self):
        assert post(CAMPAIGN_SENT, sign(CAMPAIGN_SENT)).status_code == 200

    def test_batched_payload(self):
        assert post(BATCHED, sign(BATCHED)).status_code == 200

    def test_any_content_type(self):
        assert post(SUBSCRIBER_CREATED, sign(SUBSCRIBER_CREATED), "text/plain").status_code == 200

    def test_missing_signature(self):
        assert post(SUBSCRIBER_CREATED).status_code == 400

    def test_invalid_signature(self):
        assert post(SUBSCRIBER_CREATED, "a" * 64).status_code == 400

    def test_signed_invalid_json(self):
        assert post(b"not json", sign(b"not json")).status_code == 400
