import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Unipile does not sign webhooks. The "secret" is a random value YOU put in the
# webhook's `headers` array ({"key": "Unipile-Auth", "value": "<secret>"}).
SECRET = "3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e"
os.environ["UNIPILE_WEBHOOK_SECRET"] = SECRET
os.environ.pop("UNIPILE_WEBHOOK_HEADER", None)

from main import (  # noqa: E402
    MAIL_RECEIVED,
    MESSAGE_READ,
    MESSAGE_RECEIVED,
    app,
    dedupe_key,
    dispatch,
    verify_unipile_secret,
)

client = TestClient(app)
PATH = "/webhooks/unipile"


@pytest.fixture(autouse=True)
def _reset_env():
    os.environ["UNIPILE_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("UNIPILE_WEBHOOK_HEADER", None)
    yield
    os.environ["UNIPILE_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("UNIPILE_WEBHOOK_HEADER", None)


def message_payload(event=MESSAGE_RECEIVED):
    return {
        "account_id": "dfXlh46vQYCsMbVarumWlg",
        "account_type": "LINKEDIN",
        "account_info": {"type": "LINKEDIN", "feature": "classic", "user_id": "ACoAAAcDMMQB"},
        "event": event,
        "chat_id": "R8J-xM9WX7eoHLp6gSVtWQ",
        "message_id": "ykmhfXlRW0W_cqReJYrfBw",
        "message": "Hello World !",
        "sender": {"attendee_name": "Kim Unipile", "attendee_provider_id": "ACoAA-other"},
    }


def mail_payload(event=MAIL_RECEIVED):
    return {
        "email_id": "--R9___qXQKIu80oAF0lJA",
        "account_id": "GxwlUMaZTHefegva16XcWw",
        "event": event,
        "subject": "Hello",
        "from_attendee": {"identifier": "julien@example.com", "identifier_type": "EMAIL_ADDRESS"},
    }


def status_payload(message="CREDENTIALS"):
    return {"AccountStatus": {"account_id": "h_EKCy2lRLef5NzHp0iw4A", "account_type": "LINKEDIN", "message": message}}


def post(body, header="Unipile-Auth", secret=SECRET, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if secret is not None:
        headers[header] = secret
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(PATH, content=data, headers=headers)


class TestVerifyUnipileSecret:
    def test_accepts_matching_secret(self):
        assert verify_unipile_secret(SECRET) is True

    def test_rejects_wrong_secret_same_length(self):
        assert verify_unipile_secret("0" * len(SECRET)) is False

    def test_rejects_length_mismatch(self):
        assert verify_unipile_secret(SECRET + "0") is False
        assert verify_unipile_secret("short") is False

    def test_rejects_missing_header(self):
        assert verify_unipile_secret(None) is False

    def test_fails_closed_when_secret_unset(self):
        del os.environ["UNIPILE_WEBHOOK_SECRET"]
        with pytest.raises(RuntimeError):
            verify_unipile_secret(SECRET)


class TestWebhookEndpoint:
    def test_accepts_message_received(self):
        res = post(message_payload())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_message_read_and_mail_received(self):
        assert post(message_payload(MESSAGE_READ)).status_code == 200
        assert post(mail_payload()).status_code == 200

    def test_accepts_account_status_payload(self):
        assert post(status_payload("OK")).status_code == 200
        assert post(status_payload("CREDENTIALS")).status_code == 200

    def test_header_name_is_case_insensitive(self):
        assert post(message_payload(), header="unipile-auth").status_code == 200

    def test_uses_custom_header_name(self):
        os.environ["UNIPILE_WEBHOOK_HEADER"] = "X-Acme-Token"
        assert post(message_payload(), header="X-Acme-Token").status_code == 200
        assert post(message_payload()).status_code == 401

    def test_missing_secret_header_is_401(self):
        assert post(message_payload(), secret=None).status_code == 401

    def test_wrong_secret_is_401(self):
        assert post(message_payload(), secret="not-the-secret").status_code == 401

    def test_checks_secret_before_parsing_body(self):
        assert post("{not json", secret="wrong").status_code == 401

    def test_fails_closed_when_secret_not_configured(self):
        del os.environ["UNIPILE_WEBHOOK_SECRET"]
        assert post(message_payload()).status_code == 500

    def test_invalid_json_is_400(self):
        assert post("not json").status_code == 400

    def test_missing_event_and_account_status_is_400(self):
        assert post({"account_id": "x"}).status_code == 400

    def test_unknown_event_is_acknowledged(self):
        assert post(message_payload("message_something_new")).status_code == 200

    def test_accepts_body_without_json_content_type(self):
        assert post(message_payload(), content_type="text/plain").status_code == 200


class TestDispatch:
    def test_recognises_documented_events(self):
        assert asyncio.run(dispatch(message_payload())) is True
        assert asyncio.run(dispatch(mail_payload())) is True
        assert asyncio.run(dispatch(status_payload())) is True

    def test_unknown_event_returns_false(self):
        assert asyncio.run(dispatch({"event": "something_else"})) is False


class TestDedupeKey:
    def test_keys_by_payload_shape(self):
        assert dedupe_key(message_payload()) == "message_received:ykmhfXlRW0W_cqReJYrfBw"
        assert dedupe_key(mail_payload()) == "mail_received:--R9___qXQKIu80oAF0lJA"
        assert dedupe_key({"event": "mail_opened", "event_id": "s-5DTo49QZ"}) == "mail_opened:s-5DTo49QZ"
        assert dedupe_key(status_payload("OK")) == "account_status:h_EKCy2lRLef5NzHp0iw4A:OK"

    def test_none_without_identifier(self):
        assert dedupe_key({"event": "new_relation"}) is None
