import base64
import hashlib
import hmac
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["ACUITY_API_KEY"] = "test_acuity_api_key"

from main import app, verify_acuity_signature

client = TestClient(app)

API_KEY = os.environ["ACUITY_API_KEY"]
BODY = "action=scheduled&id=13&calendarID=1&appointmentTypeID=13"


def sign(body: str, key: str = API_KEY) -> str:
    """Acuity: base64 HMAC-SHA256 of the raw body, keyed with the account API key."""
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def post(body: str, signature: str | None = None, content_type: str = "application/x-www-form-urlencoded"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Acuity-Signature"] = signature
    return client.post("/webhooks/acuity-scheduling", content=body, headers=headers)


class TestWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        assert post(BODY).status_code == 400

    def test_invalid_signature_returns_400(self):
        assert post(BODY, "invalid").status_code == 400

    def test_wrong_key_returns_400(self):
        assert post(BODY, sign(BODY, "other_key")).status_code == 400

    def test_tampered_body_returns_400(self):
        assert post(BODY.replace("id=13", "id=14"), sign(BODY)).status_code == 400

    @pytest.mark.parametrize(
        "action", ["scheduled", "rescheduled", "canceled", "changed", "order.completed"]
    )
    def test_valid_actions_return_200(self, action):
        payload = f"action={action}&id=13&calendarID=1&appointmentTypeID=13"
        res = post(payload, sign(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(BODY, sign(BODY), "text/plain").status_code == 200

    def test_unknown_action_is_acknowledged(self):
        payload = "action=something.else&id=1"
        assert post(payload, sign(payload)).status_code == 200

    def test_health(self):
        assert client.get("/health").status_code == 200


class TestVerifyAcuitySignature:
    def test_valid(self):
        assert verify_acuity_signature(BODY.encode(), sign(BODY), API_KEY) is True

    def test_missing_signature(self):
        assert verify_acuity_signature(BODY.encode(), None, API_KEY) is False

    def test_mismatched_length(self):
        assert verify_acuity_signature(BODY.encode(), "short", API_KEY) is False
