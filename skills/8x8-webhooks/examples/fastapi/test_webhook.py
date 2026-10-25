import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 9QQhlsEb8VY"
os.environ["EIGHT_X_EIGHT_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_8x8_request

client = TestClient(app)

# Shapes taken from the 8x8 docs' sample payloads (trimmed)
INBOUND = {
    "namespace": "SMS",
    "eventType": "inbound_message_received",
    "description": "SMS inbound message",
    "payload": {"umid": "9e09ac86-bd74-5465-851d-1eb5a5fdbb9a", "source": "+6581968289", "destination": "+4534735477", "body": "Test MO message"},
}
RECEIPT = {
    "namespace": "SMS",
    "eventType": "outbound_message_status_changed",
    "description": "SMS outbound message delivery receipt",
    "payload": {"umid": "9e09ac86-bd74-5465-851d-1eb5a5fdbb9a", "status": {"state": "delivered", "timestamp": "2016-01-01T00:00:00Z"}},
}
CLICK = {
    "namespace": "SMS",
    "eventType": "short_url_clicked",
    "description": "Short URL from SMS clicked",
    "payload": {"eventId": "0f6a0c0f-8b67-4a3a-a6c3-7b0ecf0d2b1a", "shortUrl": "https://2g.to/abc123/abc", "targetUrl": "https://example.com/landing"},
}
TEMPLATE = {
    "eventId": "e1",
    "provider": "WhatsApp",
    "eventType": "template_status_update",
    "eventDetails": {"templateName": "welcome", "meta": {"status": "APPROVED"}},
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(INBOUND)
    return client.post(
        "/webhooks/8x8",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestEightXEightWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer wrong-token"}).status_code == 401

    def test_rejects_credential_without_bearer_prefix(self):
        assert post(headers={"Authorization": "9QQhlsEb8VY"}).status_code == 401

    def test_compares_basic_value_as_whole_string(self, monkeypatch):
        basic = "Basic dXNlcjpwYXNzd29yZA=="
        monkeypatch.setenv("EIGHT_X_EIGHT_AUTHORIZATION", basic)
        assert post(headers={"Authorization": basic}).status_code == 200
        assert post(headers={"Authorization": "Basic dXNlcjpwYXNzd29yZB=="}).status_code == 401
        assert post(headers={"Authorization": "user:password"}).status_code == 401
        assert post(headers={"Authorization": "dXNlcjpwYXNzd29yZA=="}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(RECEIPT), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_accepts_every_documented_event_shape(self):
        for body in (INBOUND, RECEIPT, CLICK, TEMPLATE):
            assert post(json.dumps(body), {"Authorization": AUTH}).status_code == 200


class TestVerify:
    def test_never_accepts_when_unconfigured(self):
        assert verify_8x8_request({"authorization": "Bearer x"}, {}) is False
        assert verify_8x8_request({"authorization": ""}, {"EIGHT_X_EIGHT_AUTHORIZATION": ""}) is False

    def test_non_ascii_header_does_not_raise(self):
        assert verify_8x8_request({"authorization": "Bearer é"}, {"EIGHT_X_EIGHT_AUTHORIZATION": AUTH}) is False
