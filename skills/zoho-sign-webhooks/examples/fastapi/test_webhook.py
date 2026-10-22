"""Tests for the Zoho Sign webhook handler.

Signatures are generated the way Zoho Sign does:
base64(HMAC-SHA256(secret as UTF-8, raw body)).
"""

import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

TEST_SECRET = "thisisthesamplekeyfortestingpurposes"
os.environ["ZOHO_SIGN_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_zoho_sign_signature  # noqa: E402

client = TestClient(app)

EVENTS = [
    "RequestSubmitted",
    "RequestViewed",
    "RequestSigningSuccess",
    "RequestCompleted",
    "RequestRejected",
    "RequestRecalled",
    "RequestForwarded",
    "RequestExpired",
]


def sign(body: str, secret: str = TEST_SECRET) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def payload(operation_type: str) -> str:
    return json.dumps(
        {
            "notifications": {
                "performed_by_email": "testuser@zoho.com",
                "performed_at": 1555062604837,
                "reason": "reason given if any",
                "activity": "Document has been signed",
                "operation_type": operation_type,
                "action_id": "1000000000090",
                "performed_by_name": "test user",
                "ip_address": "192.168.100.100",
            },
            "requests": {
                "request_name": "NDA Document",
                "request_id": "1000000000000",
                "org_id": "9876543210",
                "request_type_id": "10000000011",
                "document_ids": [
                    {"document_name": "CommonNDA.pdf", "document_id": "100000000000050"}
                ],
            },
        }
    )


def post(body: str, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/zoho-sign",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestVerifySignature:
    # Published sample from Zoho's HMAC doc, including its leading "{{" typo.
    DOC_BODY = (
        '{{"requests":{"request_name":"Test Name"},'
        '"notifications":{"operation_type":"RequestSigningSuccess"}}'
    )
    DOC_SIGNATURE = "drbSrM4H816RYKpZiRBLddUa0yHaTrwjtY04sIZFZus="

    def test_matches_docs_sample(self):
        assert verify_zoho_sign_signature(self.DOC_BODY.encode(), self.DOC_SIGNATURE, TEST_SECRET)

    def test_rejects_docs_body_without_leading_brace(self):
        assert not verify_zoho_sign_signature(
            self.DOC_BODY[1:].encode(), self.DOC_SIGNATURE, TEST_SECRET
        )

    def test_rejects_hmac_of_payload_plus_secret(self):
        wrong = base64.b64encode(
            hmac.new(
                TEST_SECRET.encode(), (self.DOC_BODY + TEST_SECRET).encode(), hashlib.sha256
            ).digest()
        ).decode()
        assert not verify_zoho_sign_signature(self.DOC_BODY.encode(), wrong, TEST_SECRET)

    def test_rejects_missing_values_and_length_mismatch(self):
        body = self.DOC_BODY.encode()
        assert not verify_zoho_sign_signature(body, None, TEST_SECRET)
        assert not verify_zoho_sign_signature(body, self.DOC_SIGNATURE, None)
        assert not verify_zoho_sign_signature(body, "short", TEST_SECRET)


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_accepts_signed_event(self, event_type):
        body = payload(event_type)
        res = post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_any_content_type(self):
        body = payload("RequestCompleted")
        res = post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body)}, "text/plain")
        assert res.status_code == 200

    def test_accepts_unknown_event_type_once_verified(self):
        body = payload("RequestSomethingNew")
        assert post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body)}).status_code == 200

    def test_rejects_missing_signature(self):
        assert post(payload("RequestCompleted")).status_code == 400

    def test_rejects_invalid_signature(self):
        res = post(payload("RequestCompleted"), {"X-ZS-WEBHOOK-SIGNATURE": sign("other")})
        assert res.status_code == 400

    def test_rejects_wrong_secret(self):
        body = payload("RequestCompleted")
        res = post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body, "wrong_secret")})
        assert res.status_code == 400

    def test_rejects_tampered_body(self):
        body = payload("RequestCompleted")
        res = post(body.replace("NDA Document", "Evil"), {"X-ZS-WEBHOOK-SIGNATURE": sign(body)})
        assert res.status_code == 400

    def test_rejects_signed_non_json(self):
        body = "not json"
        res = post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body)}, "text/plain")
        assert res.status_code == 400

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("ZOHO_SIGN_WEBHOOK_SECRET")
        body = payload("RequestCompleted")
        res = post(body, {"X-ZS-WEBHOOK-SIGNATURE": sign(body)})
        assert res.status_code == 500
