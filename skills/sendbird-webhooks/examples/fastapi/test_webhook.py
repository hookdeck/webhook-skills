import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

# Sendbird master API token: an opaque 40-character hex string
API_TOKEN = "0123456789abcdef0123456789abcdef01234567"
os.environ["SENDBIRD_API_TOKEN"] = API_TOKEN

from main import app, verify_sendbird_webhook

client = TestClient(app)


def sign(body: bytes, token: str = API_TOKEN) -> str:
    """Sendbird: hex HMAC-SHA256 of the raw body, keyed with the master API token."""
    return hmac.new(token.encode("utf-8"), body, hashlib.sha256).hexdigest()


def event(category: str) -> bytes:
    return json.dumps({
        "category": category,
        "sender": {"user_id": "Jeff", "nickname": "Oldies but goodies"},
        "channel": {"channel_url": "sendbird_group_channel_1"},
        "payload": {"message": "Hello 👋 café"},
    }, ensure_ascii=False).encode("utf-8")


def post(body: bytes, signature="auto", content_type="application/json"):
    headers = {"content-type": content_type}
    if signature == "auto":
        signature = sign(body)
    if signature:
        headers["x-sendbird-signature"] = signature
    return client.post("/webhooks/sendbird", content=body, headers=headers)


class TestVerifySendbirdWebhook:
    def test_valid_signature_non_ascii(self):
        body = event("group_channel:message_send")
        assert verify_sendbird_webhook(body, sign(body), API_TOKEN)

    def test_uppercase_hex(self):
        body = event("user:block")
        assert verify_sendbird_webhook(body, sign(body).upper(), API_TOKEN)

    def test_rejects_bad_input(self):
        body = event("user:block")
        assert not verify_sendbird_webhook(body, "deadbeef", API_TOKEN)
        assert not verify_sendbird_webhook(body, "", API_TOKEN)
        assert not verify_sendbird_webhook(body, None, API_TOKEN)
        assert not verify_sendbird_webhook(body, sign(body, "a_secondary_token"), API_TOKEN)
        assert not verify_sendbird_webhook(body, sign(body), None)


class TestWebhookEndpoint:
    @pytest.mark.parametrize("category", [
        "group_channel:create",
        "group_channel:join",
        "group_channel:leave",
        "group_channel:message_send",
        "open_channel:message_send",
        "user:block",
        "user:unblock",
    ])
    def test_handles_event(self, category, capsys):
        res = post(event(category))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert f"Unhandled event: {category}" not in capsys.readouterr().out

    def test_acknowledges_unhandled(self, capsys):
        res = post(event("group_channel:freeze_unfreeze"))
        assert res.status_code == 200
        assert "Unhandled event: group_channel:freeze_unfreeze" in capsys.readouterr().out

    def test_any_content_type(self):
        assert post(event("group_channel:create"), content_type="text/plain").status_code == 200

    def test_invalid_signature(self):
        assert post(event("group_channel:create"), signature="deadbeef").status_code == 400

    def test_missing_signature(self):
        assert post(event("group_channel:create"), signature=None).status_code == 400

    def test_tampered_body(self):
        body = event("group_channel:create")
        assert post(body.replace(b"Jeff", b"Mallory"), signature=sign(body)).status_code == 400

    def test_invalid_json(self):
        assert post(b"not json").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
