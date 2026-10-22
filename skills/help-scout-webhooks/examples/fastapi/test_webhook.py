import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["HELPSCOUT_WEBHOOK_SECRET"] = "test_helpscout_secret"

from main import app, verify_helpscout_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["HELPSCOUT_WEBHOOK_SECRET"]

# Test vector from the Help Scout webhook documentation
DOCS_SECRET = "your secret key"
DOCS_BODY = (
    '{"ticket":{"id":"1","number":"2"},"customer":{"id":"1","fname":"Jackie",'
    '"lname":"Chan","email":"jackie.chan@somewhere.com","emails":["jackie.chan@somewhere.com"]}}'
)
DOCS_SIGNATURE = "I1KlvGppYqvFTJgJ9jezdQMDiyI="


def generate_signature(payload: str, secret: str) -> str:
    """Generate a valid Help Scout signature: base64 HMAC-SHA1 of the raw body."""
    return base64.b64encode(
        hmac.new(secret.encode(), payload.encode(), hashlib.sha1).digest()
    ).decode()


def post(body: str, headers: dict):
    return client.post(
        "/webhooks/help-scout",
        content=body,
        headers={"content-type": "application/json", **headers},
    )


class TestVerifyHelpScoutWebhook:
    def test_matches_docs_test_vector(self):
        assert generate_signature(DOCS_BODY, DOCS_SECRET) == DOCS_SIGNATURE
        assert verify_helpscout_webhook(DOCS_BODY.encode(), DOCS_SIGNATURE, DOCS_SECRET)

    def test_valid_signature(self):
        body = '{"id":123}'
        assert verify_helpscout_webhook(body.encode(), generate_signature(body, SECRET), SECRET)

    def test_invalid_signature(self):
        assert not verify_helpscout_webhook(b'{"id":123}', "invalid_signature", SECRET)

    def test_wrong_secret(self):
        body = '{"id":123}'
        assert not verify_helpscout_webhook(body.encode(), generate_signature(body, "other"), SECRET)

    def test_missing_header_or_secret(self):
        assert not verify_helpscout_webhook(b"{}", None, SECRET)
        assert not verify_helpscout_webhook(b"{}", "abc", None)


class TestWebhookEndpoint:
    def test_missing_signature(self):
        response = post('{"id":1}', {"x-helpscout-event": "convo.created"})
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_invalid_signature(self):
        response = post(
            '{"id":1}',
            {"x-helpscout-signature": "invalid_signature", "x-helpscout-event": "convo.created"},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    @pytest.mark.parametrize(
        "event",
        [
            "convo.created",
            "convo.assigned",
            "convo.status",
            "convo.customer.reply.created",
            "convo.agent.reply.created",
            "customer.created",
            "customer.updated",
            "satisfaction.ratings",
        ],
    )
    def test_signed_events_accepted(self, event):
        body = json.dumps({"id": 123, "subject": "Help", "status": "active"})
        response = post(
            body,
            {"x-helpscout-signature": generate_signature(body, SECRET), "x-helpscout-event": event},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "success"}

    def test_any_content_type(self):
        body = json.dumps({"id": 1})
        response = client.post(
            "/webhooks/help-scout",
            content=body,
            headers={
                "content-type": "text/plain",
                "x-helpscout-signature": generate_signature(body, SECRET),
                "x-helpscout-event": "convo.created",
            },
        )
        assert response.status_code == 200

    def test_modified_body_rejected(self):
        response = post(
            '{"id":2}',
            {"x-helpscout-signature": generate_signature('{"id":1}', SECRET), "x-helpscout-event": "convo.created"},
        )
        assert response.status_code == 400

    def test_unhandled_event_returns_200(self):
        body = json.dumps({"id": 9})
        response = post(
            body,
            {"x-helpscout-signature": generate_signature(body, SECRET), "x-helpscout-event": "tag.created"},
        )
        assert response.status_code == 200
