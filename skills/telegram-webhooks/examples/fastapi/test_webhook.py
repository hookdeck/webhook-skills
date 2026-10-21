import json
import os

import pytest
from fastapi.testclient import TestClient

# Secret token in the format setWebhook accepts (A-Z a-z 0-9 _ -, 1-256 chars)
SECRET = "test_telegram_secret-Token_0123456789"
os.environ["TELEGRAM_WEBHOOK_SECRET"] = SECRET

from main import app, get_update_type, verify_telegram_secret_token  # noqa: E402

client = TestClient(app)

HEADER = "X-Telegram-Bot-Api-Secret-Token"
CHAT = {"id": 111111111, "type": "private", "first_name": "Ada"}
FROM = {"id": 111111111, "is_bot": False, "first_name": "Ada", "username": "ada"}


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", SECRET)


def send_update(update, secret=SECRET):
    headers = {"Content-Type": "application/json"}
    if secret is not None:
        headers[HEADER] = secret
    body = update if isinstance(update, str) else json.dumps(update)
    return client.post("/webhooks/telegram", content=body, headers=headers)


class TestVerifyTelegramSecretToken:
    def test_accepts_exact_secret(self):
        assert verify_telegram_secret_token(SECRET, SECRET) is True

    def test_rejects_same_length_wrong_secret(self):
        assert verify_telegram_secret_token(SECRET[:-1] + "X", SECRET) is False

    def test_rejects_different_length(self):
        assert verify_telegram_secret_token("short", SECRET) is False

    def test_rejects_non_ascii_without_raising(self):
        assert verify_telegram_secret_token("sécret", SECRET) is False

    def test_fails_closed_when_missing(self):
        assert verify_telegram_secret_token(None, SECRET) is False
        assert verify_telegram_secret_token(SECRET, None) is False
        assert verify_telegram_secret_token("", "") is False


def test_get_update_type():
    assert get_update_type({"update_id": 1, "inline_query": {}}) == "inline_query"


class TestTelegramWebhook:
    message = {"update_id": 1, "message": {"message_id": 1, "chat": CHAT, "date": 0}}

    def test_rejects_missing_header(self):
        assert send_update(self.message, secret=None).status_code == 401

    def test_rejects_wrong_secret(self):
        assert send_update(self.message, secret="wrong_secret").status_code == 401

    def test_rejects_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET")
        assert send_update(self.message).status_code == 401

    def test_invalid_json(self):
        assert send_update("{not json").status_code == 400

    def test_json_that_is_not_an_update(self):
        assert send_update({"hello": "world"}).status_code == 400

    def test_message(self):
        response = send_update({
            "update_id": 100,
            "message": {"message_id": 42, "from": FROM, "chat": CHAT, "date": 1760000000, "text": "/start"},
        })
        assert response.status_code == 200

    def test_edited_message(self):
        response = send_update({
            "update_id": 101,
            "edited_message": {"message_id": 42, "from": FROM, "chat": CHAT, "date": 1760000000,
                               "edit_date": 1760000010, "text": "edited"},
        })
        assert response.status_code == 200

    def test_channel_post(self):
        response = send_update({
            "update_id": 102,
            "channel_post": {"message_id": 7, "chat": {"id": -1001234567890, "type": "channel", "title": "News"},
                             "date": 1760000000, "text": "Hello"},
        })
        assert response.status_code == 200

    def test_callback_query_is_answered_in_response(self):
        response = send_update({
            "update_id": 103,
            "callback_query": {"id": "4382bfdwdsb323b2d9", "from": FROM, "chat_instance": "-123",
                               "data": "confirm:order_42"},
        })
        assert response.status_code == 200
        assert response.json() == {"method": "answerCallbackQuery", "callback_query_id": "4382bfdwdsb323b2d9"}

    def test_inline_query(self):
        response = send_update({
            "update_id": 104,
            "inline_query": {"id": "987654321", "from": FROM, "query": "cats", "offset": ""},
        })
        assert response.status_code == 200

    def test_my_chat_member(self):
        bot = {"id": 222, "is_bot": True, "first_name": "Bot"}
        response = send_update({
            "update_id": 105,
            "my_chat_member": {
                "chat": CHAT, "from": FROM, "date": 1760000000,
                "old_chat_member": {"status": "member", "user": bot},
                "new_chat_member": {"status": "kicked", "user": bot, "until_date": 0},
            },
        })
        assert response.status_code == 200

    def test_unknown_update_type_is_acknowledged(self):
        response = send_update({"update_id": 106, "poll_answer": {"poll_id": "1", "option_ids": [0]}})
        assert response.status_code == 200


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
