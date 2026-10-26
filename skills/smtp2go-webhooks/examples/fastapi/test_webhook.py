import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516"
os.environ["SMTP2GO_AUTHORIZATION"] = AUTH

from urllib.parse import urlencode

from fastapi.testclient import TestClient

from main import app, parse_body, verify_smtp2go_request

client = TestClient(app)

DELIVERED = {
    "event": "delivered",
    "time": "2026-10-26T10:00:00Z",
    "sender": "sender@example.com",
    "rcpt": "user@example.com",
    "email_id": "1abcDE-ABC123-xy",
    "id": "wh-1",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(DELIVERED)
    return client.post(
        "/webhooks/smtp2go",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSmtp2goWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_rejects_token_without_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_checks_credential_before_parsing_body(self):
        assert post(body="not json").status_code == 401

    def test_handles_json_bounce_event(self, capsys):
        body = json.dumps({**DELIVERED, "event": "bounce", "bounce": "hard", "message": "550 no such user"})
        res = post(body=body, headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert "Bounce (hard) for user@example.com" in capsys.readouterr().out

    def test_handles_form_encoded_event(self, capsys):
        body = urlencode({"event": "open", "rcpt": "user@example.com", "email_id": "e1"})
        res = post(body=body, headers={"Authorization": AUTH}, content_type="application/x-www-form-urlencoded")
        assert res.status_code == 200
        assert "Opened e1 by user@example.com" in capsys.readouterr().out

    def test_handles_sms_event(self, capsys):
        body = json.dumps({"event": "sms_failed", "destination_number": "+15555550100", "message_id": "sms-1", "status_code": "500"})
        res = post(body=body, headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert "SMS sms-1 to +15555550100 failed (500)" in capsys.readouterr().out

    def test_accepts_unknown_events(self):
        assert post(body='{"event":"something_new"}', headers={"Authorization": AUTH}).status_code == 200

    def test_returns_400_for_invalid_json(self):
        assert post(body="not json", headers={"Authorization": AUTH}).status_code == 400

    def test_returns_400_for_json_array(self):
        assert post(body="[1,2]", headers={"Authorization": AUTH}).status_code == 400


class TestVerifyAndParse:
    def test_compares_whole_value_including_basic_prefix(self):
        basic = "Basic dXNlcjpwYXNz"
        config = {"SMTP2GO_AUTHORIZATION": basic}
        assert verify_smtp2go_request({"authorization": basic}, config) is True
        assert verify_smtp2go_request({"authorization": "dXNlcjpwYXNz"}, config) is False

    def test_rejects_everything_when_unconfigured(self):
        assert verify_smtp2go_request({"authorization": "x"}, {}) is False

    def test_non_ascii_header_does_not_raise(self):
        assert verify_smtp2go_request({"authorization": "Bearer é"}, {"SMTP2GO_AUTHORIZATION": AUTH}) is False

    def test_parse_body_both_output_types(self):
        assert parse_body(b'{"event":"click"}', "application/json") == {"event": "click"}
        assert parse_body(b"event=click&rcpt=a%40b.com", "application/x-www-form-urlencoded") == {
            "event": "click",
            "rcpt": "a@b.com",
        }
