# Generated with: green-api-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

import pytest

# webhookUrlToken as entered in GREEN-API, scheme included (the docs' recommended form).
TOKEN = "Bearer test_green_api_webhook_token"
os.environ["GREEN_API_WEBHOOK_URL_TOKEN"] = TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, expected_authorization, verify_green_api_authorization  # noqa: E402

client = TestClient(app)

INSTANCE_DATA = {"idInstance": 7103000000, "wid": "79876543210@c.us", "typeInstance": "whatsapp"}

# Payloads taken from the GREEN-API notification format docs.
INCOMING_MESSAGE = {
    "typeWebhook": "incomingMessageReceived",
    "instanceData": INSTANCE_DATA,
    "timestamp": 1588091580,
    "idMessage": "F7AEC1B7086ECDC7E6E45923F5EDB825",
    "senderData": {
        "chatId": "79001234567@c.us",
        "sender": "79001234567@c.us",
        "chatName": "John",
        "senderName": "John",
        "senderContactName": "John Doe",
    },
    "messageData": {
        "typeMessage": "textMessage",
        "textMessageData": {"textMessage": "I use Green-API to send this message to you!"},
    },
}

OUTGOING_STATUS = {
    "typeWebhook": "outgoingMessageStatus",
    "chatId": "79001234567@c.us",
    "instanceData": INSTANCE_DATA,
    "timestamp": 1727691478,
    "idMessage": "3EB0608D6A2901063D63",
    "status": "delivered",
    "sendByApi": True,
}

OUTGOING_API_MESSAGE = {
    "typeWebhook": "outgoingAPIMessageReceived",
    "instanceData": INSTANCE_DATA,
    "timestamp": 1588091580,
    "idMessage": "BAE5F4886F6F2D05",
    "senderData": {"chatId": "79001234567@c.us", "sender": "79876543210@c.us", "chatName": "John", "senderName": ""},
    "messageData": {"typeMessage": "textMessage", "textMessageData": {"textMessage": "Hello"}},
}

STATE_CHANGED = {
    "typeWebhook": "stateInstanceChanged",
    "instanceData": {"idInstance": 1, "wid": "", "typeInstance": "whatsapp"},
    "timestamp": 1586700690,
    "stateInstance": "notAuthorized",
}


def post(body, authorization=None):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/green-api", content=content, headers=headers)


class TestExpectedAuthorization:
    def test_keeps_bearer_and_basic(self):
        assert expected_authorization("Bearer abc") == "Bearer abc"
        assert expected_authorization("Basic dXNlcjpwYXNz") == "Basic dXNlcjpwYXNz"

    def test_bare_token_defaults_to_bearer(self):
        assert expected_authorization("abc") == "Bearer abc"


class TestVerifyGreenApiAuthorization:
    def test_accepts_full_header_value(self):
        assert verify_green_api_authorization(TOKEN, TOKEN)

    def test_accepts_bearer_when_bare_token_configured(self):
        assert verify_green_api_authorization("Bearer abc", "abc")

    def test_accepts_basic_when_basic_configured(self):
        assert verify_green_api_authorization("Basic dXNlcjpwYXNz", "Basic dXNlcjpwYXNz")

    def test_rejects_bare_token_without_scheme(self):
        assert not verify_green_api_authorization("test_green_api_webhook_token", TOKEN)

    def test_rejects_wrong_scheme(self):
        assert not verify_green_api_authorization("Basic test_green_api_webhook_token", TOKEN)

    def test_rejects_wrong_token_equal_length(self):
        assert not verify_green_api_authorization("Bearer test_green_api_webhook_XXXXX", TOKEN)

    def test_rejects_missing_values(self):
        assert not verify_green_api_authorization(TOKEN, None)
        assert not verify_green_api_authorization(None, TOKEN)


class TestWebhookEndpoint:
    def test_missing_authorization_returns_401(self):
        assert post(INCOMING_MESSAGE).status_code == 401

    def test_wrong_token_returns_401(self):
        assert post(INCOMING_MESSAGE, "Bearer wrong").status_code == 401

    def test_bare_token_without_scheme_returns_401(self):
        assert post(INCOMING_MESSAGE, "test_green_api_webhook_token").status_code == 401

    def test_invalid_json_returns_400(self):
        assert post("not json", TOKEN).status_code == 400

    def test_missing_type_webhook_returns_400(self):
        assert post({"foo": "bar"}, TOKEN).status_code == 400

    @pytest.mark.parametrize(
        "body",
        [INCOMING_MESSAGE, OUTGOING_STATUS, OUTGOING_API_MESSAGE, STATE_CHANGED],
        ids=lambda b: b["typeWebhook"],
    )
    def test_valid_notifications_return_200(self, body):
        response = post(body, TOKEN)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unknown_type_webhook_returns_200(self):
        body = {"typeWebhook": "quotaExceeded", "instanceData": INSTANCE_DATA, "timestamp": 1}
        assert post(body, TOKEN).status_code == 200

    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
