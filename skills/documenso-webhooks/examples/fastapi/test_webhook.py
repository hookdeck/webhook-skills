import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["DOCUMENSO_WEBHOOK_SECRET"] = "test_documenso_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_documenso_secret

client = TestClient(app)

SECRET = os.environ["DOCUMENSO_WEBHOOK_SECRET"]

EVENTS = [
    "DOCUMENT_CREATED",
    "DOCUMENT_SENT",
    "DOCUMENT_OPENED",
    "DOCUMENT_SIGNED",
    "DOCUMENT_RECIPIENT_COMPLETED",
    "DOCUMENT_COMPLETED",
    "DOCUMENT_REJECTED",
    "DOCUMENT_CANCELLED",
    "DOCUMENT_REMINDER_SENT",
    "RECIPIENT_EXPIRED",
    "TEMPLATE_CREATED",
    "TEMPLATE_UPDATED",
    "TEMPLATE_DELETED",
    "TEMPLATE_USED",
    "SOMETHING_ELSE",
]


def sample_payload(event="DOCUMENT_COMPLETED"):
    """Shape documented at https://docs.documenso.com/docs/developers/webhooks/events"""
    return {
        "event": event,
        "payload": {
            "id": 10,
            "envelopeId": "envelope_abcdefhiklmnorst",
            "title": "contract.pdf",
            "status": "COMPLETED",
            "recipients": [{"id": 52, "email": "signer@example.com", "signingStatus": "SIGNED"}],
        },
        "createdAt": "2024-04-22T11:52:18.277Z",
        "webhookEndpoint": "https://example.com/webhooks/documenso",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/documenso",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeader:
    def test_accepts_correct_secret(self):
        res = post({"X-Documenso-Secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-documenso-secret": SECRET}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        res = post({"X-Documenso-Secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_wrong_secret_of_same_length(self):
        assert post({"X-Documenso-Secret": "x" * len(SECRET)}).status_code == 401

    def test_rejects_secret_of_different_length(self):
        assert post({"X-Documenso-Secret": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_empty_header(self):
        assert post({"X-Documenso-Secret": ""}).status_code == 401

    def test_does_not_treat_secret_as_hmac_of_body(self):
        body = json.dumps(sample_payload())
        digest = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert post({"X-Documenso-Secret": digest}, body=body).status_code == 401


class TestBody:
    def test_invalid_json_returns_400_after_auth(self):
        assert post({"X-Documenso-Secret": SECRET}, body="not json").status_code == 400

    def test_json_array_returns_400(self):
        assert post({"X-Documenso-Secret": SECRET}, body="[1, 2]").status_code == 400

    @pytest.mark.parametrize("event", EVENTS)
    def test_events_return_200(self, event):
        res = post({"X-Documenso-Secret": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200


class TestVerifyFunction:
    def test_accepts_matching_secret(self):
        assert verify_documenso_secret(SECRET, SECRET) is True

    def test_rejects_when_no_secret_configured(self):
        assert verify_documenso_secret("", "") is False
        assert verify_documenso_secret(None, "") is False
        assert verify_documenso_secret("anything", "") is False

    def test_rejects_empty_or_missing_header(self):
        assert verify_documenso_secret("", SECRET) is False
        assert verify_documenso_secret(None, SECRET) is False
