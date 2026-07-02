import os
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

os.environ["MAILCHIMP_WEBHOOK_SECRET"] = "test_secret_value_for_unit_tests"

from main import app, verify_mailchimp_secret, parse_form_data  # noqa: E402

client = TestClient(app)

SECRET = os.environ["MAILCHIMP_WEBHOOK_SECRET"]
WEBHOOK_PATH = "/webhooks/mailchimp"


def encode_mailchimp_payload(obj: dict) -> str:
    """Flatten a nested dict into Mailchimp's bracket-notation form encoding."""
    flat: dict = {}

    def walk(value, prefix):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, f"{prefix}[{k}]" if prefix else k)
        else:
            flat[prefix] = value

    walk(obj, "")
    return urlencode(flat)


def post_webhook(payload: dict, *, secret=SECRET, omit_secret: bool = False):
    path = WEBHOOK_PATH if omit_secret else f"{WEBHOOK_PATH}?secret={secret}"
    return client.post(
        path,
        content=encode_mailchimp_payload(payload),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


SUBSCRIBE_PAYLOAD = {
    "type": "subscribe",
    "fired_at": "2026-07-02 21:35:57",
    "data": {
        "id": "8a25ff1d98",
        "list_id": "a6b5da1054",
        "email": "api@example.com",
        "email_type": "html",
        "merges": {"EMAIL": "api@example.com", "FNAME": "Example", "LNAME": "User"},
        "ip_opt": "10.20.10.30",
        "ip_signup": "10.20.10.30",
    },
}


class TestVerifyMailchimpSecret:
    def test_matching_secret_returns_true(self):
        assert verify_mailchimp_secret(SECRET, SECRET) is True

    def test_wrong_secret_returns_false(self):
        assert verify_mailchimp_secret("nope", SECRET) is False

    def test_empty_secret_returns_false(self):
        assert verify_mailchimp_secret("", SECRET) is False

    def test_empty_expected_returns_false(self):
        assert verify_mailchimp_secret(SECRET, "") is False

    def test_same_prefix_different_length_returns_false(self):
        assert verify_mailchimp_secret(SECRET + "extra", SECRET) is False


class TestParseFormData:
    def test_expands_bracket_notation(self):
        form = {"type": "subscribe", "data[id]": "1", "data[merges][FNAME]": "Ex"}
        parsed = parse_form_data(form)
        assert parsed["type"] == "subscribe"
        assert parsed["data"]["id"] == "1"
        assert parsed["data"]["merges"]["FNAME"] == "Ex"


class TestUrlValidation:
    def test_get_returns_200(self):
        response = client.get(WEBHOOK_PATH)
        assert response.status_code == 200


class TestMailchimpWebhookEndpoint:
    def test_missing_secret_returns_401(self):
        response = post_webhook(SUBSCRIBE_PAYLOAD, omit_secret=True)
        assert response.status_code == 401

    def test_wrong_secret_returns_401(self):
        response = post_webhook(SUBSCRIBE_PAYLOAD, secret="wrong-secret")
        assert response.status_code == 401

    def test_subscribe_with_valid_secret_returns_200(self):
        response = post_webhook(SUBSCRIBE_PAYLOAD)
        assert response.status_code == 200

    @pytest.mark.parametrize(
        "payload",
        [
            SUBSCRIBE_PAYLOAD,
            {
                "type": "unsubscribe",
                "data": {
                    "action": "unsub",
                    "reason": "manual",
                    "id": "8a25ff1d98",
                    "list_id": "a6b5da1054",
                    "email": "api@example.com",
                    "campaign_id": "cb398d21d2",
                },
            },
            {
                "type": "profile",
                "data": {
                    "id": "8a25ff1d98",
                    "list_id": "a6b5da1054",
                    "email": "api@example.com",
                    "merges": {"FNAME": "Example"},
                },
            },
            {
                "type": "upemail",
                "data": {
                    "list_id": "a6b5da1054",
                    "new_id": "51da8c3259",
                    "new_email": "new@example.com",
                    "old_email": "old@example.com",
                },
            },
            {
                "type": "cleaned",
                "data": {
                    "list_id": "a6b5da1054",
                    "campaign_id": "4fjk2ma9xd",
                    "reason": "hard",
                    "email": "bounce@example.com",
                },
            },
            {
                "type": "campaign",
                "data": {
                    "id": "5aa2102003",
                    "subject": "Test Campaign",
                    "status": "sent",
                    "reason": "",
                    "list_id": "a6b5da1054",
                },
            },
        ],
    )
    def test_handles_every_event_type(self, payload):
        response = post_webhook(payload)
        assert response.status_code == 200

    def test_unknown_event_type_returns_200(self):
        response = post_webhook({"type": "something_new", "data": {"id": "1"}})
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
