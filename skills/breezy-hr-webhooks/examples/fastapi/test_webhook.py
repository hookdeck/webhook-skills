import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Breezy secrets look like Standard Webhooks secrets, but the whole string
# (including whsec_) is used as a UTF-8 HMAC key.
SECRET = "whsec_test_secret_key_0123456789abcdef"
os.environ["BREEZY_HR_WEBHOOK_SECRET"] = SECRET

from main import app, verify_breezy_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def event(event_type: str = "candidateAdded") -> dict:
    return {
        "_id": "evt_123",
        "type": event_type,
        "object": {
            "company": {"_id": "c1", "name": "Acme", "friendly_id": "acme"},
            "position": {"_id": "p1", "name": "Engineer", "pipeline_id": "pl1"},
            "stage": {"id": "s1", "name": "Applied"},
            "candidate": {"_id": "cand1", "name": "Ada Lovelace", "email_address": "ada@example.com"},
        },
        "creation_date": "2026-01-05T19:26:51.000Z",
    }


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Hook-Signature"] = signature
    return client.post("/webhooks/breezy-hr", content=body, headers=headers)


class TestVerifyBreezySignature:
    body = b'{"a":1}'

    def test_accepts_valid_signature(self):
        assert verify_breezy_signature(self.body, sign(self.body), SECRET)

    def test_rejects_different_secret(self):
        assert not verify_breezy_signature(self.body, sign(self.body, "other"), SECRET)

    def test_rejects_stripped_whsec_key(self):
        assert not verify_breezy_signature(self.body, sign(self.body, SECRET[len("whsec_"):]), SECRET)

    def test_rejects_base64_decoded_key(self):
        # A Standard Webhooks library would base64-decode the part after whsec_
        decoded = base64.urlsafe_b64decode(SECRET[len("whsec_"):][:28])
        sig = hmac.new(decoded, self.body, hashlib.sha256).hexdigest()
        assert not verify_breezy_signature(self.body, sig, SECRET)

    def test_rejects_missing_and_short_signatures(self):
        assert not verify_breezy_signature(self.body, None, SECRET)
        assert not verify_breezy_signature(self.body, "abc", SECRET)


class TestWebhookEndpoint:
    def test_accepts_valid_event(self):
        body = json.dumps(event()).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_raw_bytes_including_non_compact_json(self):
        body = json.dumps(event(), indent=2).encode()
        assert post(body, sign(body)).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(event()).encode()
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "candidateAdded",
            "candidateStatusUpdated",
            "candidateDeleted",
            "companyPositionAdded",
            "companyPositionUpdated",
            "companyPositionDeleted",
            "companyPositionStateUpdated",
            "companyNotePosted",
            "companyNoteUpdated",
            "companyNoteDeleted",
            "somethingNew",
        ],
    )
    def test_acknowledges_events(self, event_type):
        body = json.dumps(event(event_type)).encode()
        assert post(body, sign(body)).status_code == 200

    def test_rejects_invalid_signature(self):
        body = json.dumps(event()).encode()
        assert post(body, sign(body, "wrong")).status_code == 400

    def test_rejects_tampered_body(self):
        body = json.dumps(event()).encode()
        assert post(body.replace(b"Ada", b"Eve"), sign(body)).status_code == 400

    def test_rejects_missing_signature(self):
        assert post(json.dumps(event()).encode()).status_code == 400

    def test_rejects_signed_invalid_json(self):
        body = b"{not json"
        assert post(body, sign(body)).status_code == 400
