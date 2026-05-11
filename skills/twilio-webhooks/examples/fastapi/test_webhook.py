import base64
import hashlib
import hmac
import os
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

os.environ["TWILIO_AUTH_TOKEN"] = "test_auth_token_for_unit_tests"
os.environ["WEBHOOK_BASE_URL"] = "https://example.com"

from main import app, verify_twilio_webhook  # noqa: E402

client = TestClient(app)

AUTH_TOKEN = os.environ["TWILIO_AUTH_TOKEN"]
WEBHOOK_URL = "https://example.com/webhooks/twilio"


def generate_twilio_signature(auth_token: str, url: str, params: dict) -> str:
    """
    Generate a valid X-Twilio-Signature for a form-encoded webhook.

    Algorithm (matches the Twilio SDKs):
        s = url + concat(sortedParamName + paramValue)
        signature = base64(HMAC-SHA1(auth_token, s))
    """
    s = url
    for name in sorted(params):
        s += name + params[name]
    mac = hmac.new(auth_token.encode("utf-8"), s.encode("utf-8"), hashlib.sha1)
    return base64.b64encode(mac.digest()).decode("utf-8")


def post_webhook(params: dict, *, signature=None, omit_signature: bool = False):
    """POST a form-encoded webhook with a valid (or supplied) signature."""
    if signature is None:
        signature = generate_twilio_signature(AUTH_TOKEN, WEBHOOK_URL, params)
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if not omit_signature:
        headers["X-Twilio-Signature"] = signature
    return client.post(
        "/webhooks/twilio",
        content=urlencode(params),
        headers=headers,
    )


class TestVerifyTwilioWebhook:
    """Unit tests for the verify_twilio_webhook helper."""

    def test_valid_signature_returns_true(self):
        params = {"MessageSid": "SM123", "From": "+14155552671", "Body": "hello"}
        signature = generate_twilio_signature(AUTH_TOKEN, WEBHOOK_URL, params)
        assert verify_twilio_webhook(AUTH_TOKEN, signature, WEBHOOK_URL, params) is True

    def test_invalid_signature_returns_false(self):
        params = {"MessageSid": "SM123"}
        assert verify_twilio_webhook(AUTH_TOKEN, "invalid", WEBHOOK_URL, params) is False

    def test_empty_signature_returns_false(self):
        assert verify_twilio_webhook(AUTH_TOKEN, "", WEBHOOK_URL, {}) is False

    def test_tampered_payload_returns_false(self):
        original = {"Body": "hello"}
        tampered = {"Body": "goodbye"}
        signature = generate_twilio_signature(AUTH_TOKEN, WEBHOOK_URL, original)
        assert verify_twilio_webhook(AUTH_TOKEN, signature, WEBHOOK_URL, tampered) is False

    def test_wrong_secret_returns_false(self):
        params = {"Body": "hello"}
        signature = generate_twilio_signature(AUTH_TOKEN, WEBHOOK_URL, params)
        assert verify_twilio_webhook("wrong-token", signature, WEBHOOK_URL, params) is False


class TestTwilioWebhookEndpoint:
    """Integration tests for POST /webhooks/twilio."""

    def test_missing_signature_returns_403(self):
        response = post_webhook(
            {"MessageSid": "SM1", "Body": "hi"},
            omit_signature=True,
        )
        assert response.status_code == 403

    def test_invalid_signature_returns_403(self):
        response = post_webhook(
            {"MessageSid": "SM1", "Body": "hi"},
            signature="invalid_signature",
        )
        assert response.status_code == 403

    def test_incoming_sms_returns_200_and_twiml(self):
        params = {
            "MessageSid": "SM" + "a" * 32,
            "AccountSid": "AC" + "a" * 32,
            "From": "+14155552671",
            "To": "+14155552672",
            "Body": "Hello!",
            "NumMedia": "0",
        }
        response = post_webhook(params)
        assert response.status_code == 200
        assert "text/xml" in response.headers["content-type"]
        assert "<Response>" in response.text
        assert "<Message>" in response.text

    def test_message_status_callback_returns_204(self):
        params = {
            "MessageSid": "SM" + "b" * 32,
            "MessageStatus": "delivered",
            "AccountSid": "AC" + "a" * 32,
        }
        response = post_webhook(params)
        assert response.status_code == 204

    @pytest.mark.parametrize(
        "status",
        ["queued", "sending", "sent", "delivered", "undelivered", "failed"],
    )
    def test_handles_every_message_status(self, status):
        params = {
            "MessageSid": "SM" + "c" * 32,
            "MessageStatus": status,
        }
        if status in ("failed", "undelivered"):
            params["ErrorCode"] = "30003"
        response = post_webhook(params)
        assert response.status_code == 204

    def test_incoming_voice_call_returns_200_and_twiml(self):
        params = {
            "CallSid": "CA" + "d" * 32,
            "AccountSid": "AC" + "a" * 32,
            "From": "+14155552671",
            "To": "+14155552672",
            "CallStatus": "ringing",
            "Direction": "inbound",
        }
        response = post_webhook(params)
        assert response.status_code == 200
        assert "text/xml" in response.headers["content-type"]
        assert "<Say>" in response.text

    def test_call_status_callback_returns_204(self):
        params = {
            "CallSid": "CA" + "e" * 32,
            "CallStatus": "completed",
            "Direction": "outbound-api",
            "From": "+14155552671",
            "To": "+14155552672",
        }
        response = post_webhook(params)
        assert response.status_code == 204

    @pytest.mark.parametrize(
        "status",
        ["queued", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"],
    )
    def test_handles_every_call_status(self, status):
        params = {
            "CallSid": "CA" + "f" * 32,
            "CallStatus": status,
            "Direction": "outbound-api",
        }
        response = post_webhook(params)
        assert response.status_code == 204

    def test_recording_status_callback_returns_204(self):
        params = {
            "RecordingSid": "RE" + "g" * 32,
            "RecordingStatus": "completed",
            "RecordingUrl": "https://api.twilio.com/recordings/REabc",
            "CallSid": "CA" + "h" * 32,
        }
        response = post_webhook(params)
        assert response.status_code == 204


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
