import os
import hmac
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

APP_SECRET = "test_app_secret"
VERIFY_TOKEN = "test_verify_token"

os.environ["MESSENGER_APP_SECRET"] = APP_SECRET
os.environ["MESSENGER_VERIFY_TOKEN"] = VERIFY_TOKEN

from main import app, event_type  # noqa: E402

client = TestClient(app)

PAGE_ID = "106000000000001"


def sign(payload: bytes, secret: str = APP_SECRET) -> str:
    """Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the App Secret>."""
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def body(item: dict, key: str = "messaging", ensure_ascii: bool = False) -> bytes:
    event = {"sender": {"id": "PSID_1"}, "recipient": {"id": PAGE_ID}, "timestamp": 1458692752478, **item}
    return json.dumps(
        {"object": "page", "entry": [{"id": PAGE_ID, "time": 1458692752478, key: [event]}]},
        ensure_ascii=ensure_ascii,
    ).encode("utf-8")


def post(payload: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Hub-Signature-256"] = signature
    return client.post("/webhooks/messenger", content=payload, headers=headers)


TEXT = body({"message": {"mid": "mid.1457764197618:41d102a3e1ae206a38", "text": "hello, world!"}})

# Meta signs the escaped-unicode payload: "äöå" as "\u00e4\u00f6\u00e5".
ESCAPED = body({"message": {"mid": "m_1", "text": "äöå"}}, ensure_ascii=True)


class TestHandshake:
    def test_echoes_challenge(self):
        res = client.get(
            "/webhooks/messenger",
            params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "CHALLENGE_ACCEPTED"},
        )
        assert res.status_code == 200
        assert res.text == "CHALLENGE_ACCEPTED"

    def test_wrong_token(self):
        res = client.get(
            "/webhooks/messenger",
            params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1"},
        )
        assert res.status_code == 403

    def test_missing_token(self):
        res = client.get("/webhooks/messenger", params={"hub.mode": "subscribe", "hub.challenge": "1"})
        assert res.status_code == 403


class TestSignature:
    def test_valid(self):
        assert post(TEXT, sign(TEXT)).status_code == 200

    def test_uppercase_hex(self):
        assert post(TEXT, "sha256=" + sign(TEXT)[7:].upper()).status_code == 200

    def test_any_content_type(self):
        assert post(TEXT, sign(TEXT), "text/plain").status_code == 200

    def test_escaped_unicode_bytes(self):
        assert b"\\u00e4\\u00f6\\u00e5" in ESCAPED
        assert post(ESCAPED, sign(ESCAPED)).status_code == 200

    def test_signature_over_decoded_unicode_fails(self):
        decoded = json.dumps(json.loads(ESCAPED), ensure_ascii=False).encode("utf-8")
        assert "äöå".encode("utf-8") in decoded
        assert post(ESCAPED, sign(decoded)).status_code == 401

    def test_missing_header(self):
        assert post(TEXT).status_code == 401

    def test_wrong_secret(self):
        assert post(TEXT, sign(TEXT, "other_secret")).status_code == 401

    def test_tampered_body(self):
        assert post(TEXT.replace(b"hello", b"HELLO"), sign(TEXT)).status_code == 401

    def test_missing_prefix(self):
        assert post(TEXT, sign(TEXT)[7:]).status_code == 401

    def test_legacy_sha1_prefix(self):
        assert post(TEXT, "sha1=" + sign(TEXT)[7:]).status_code == 401

    def test_bad_digest_lengths_and_chars(self):
        digest = sign(TEXT)[7:]
        assert post(TEXT, "sha256=" + digest[:40]).status_code == 401
        assert post(TEXT, "sha256=" + digest[:62] + "zz").status_code == 401
        assert post(TEXT, "sha256=" + digest + "ab").status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/messenger",
            content=TEXT,
            headers={"X-Hub-Signature-256": "sha256=é".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_signed_non_json(self):
        assert post(b"not json", sign(b"not json"), "text/plain").status_code == 400

    def test_signed_non_object_json(self):
        assert post(b"[1]", sign(b"[1]")).status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "expected,item",
        [
            ("messages", {"message": {"mid": "m_1", "text": "hi"}}),
            ("messages", {"message": {"mid": "m_1", "attachments": [{"type": "image", "payload": {"url": "https://x"}}]}}),
            ("messages", {"message": {"mid": "m_1", "text": "Red", "quick_reply": {"payload": "RED"}}}),
            ("messages", {"message": {"admin_text": "Ready to buy", "handoff_reason": "purchase_intent"}}),
            ("message_echoes", {"message": {"is_echo": True, "app_id": 1517776481860111, "mid": "m_2", "text": "hi"}}),
            ("messaging_postbacks", {"postback": {"mid": "m_3", "title": "Get Started", "payload": "GET_STARTED"}}),
            ("message_reads", {"read": {"watermark": 1458668856253}}),
            ("message_deliveries", {"delivery": {"mids": ["mid.1"], "watermark": 1458668856253}}),
            ("message_reactions", {"reaction": {"reaction": "love", "emoji": "❤️", "action": "react", "mid": "m_1"}}),
            ("messaging_optins", {"optin": {"type": "notification_messages", "notification_messages_token": "T"}}),
            ("messaging_referrals", {"referral": {"ref": "promo", "source": "SHORTLINK", "type": "OPEN_THREAD"}}),
            ("message_edits", {"message_edit": {"mid": "m_1", "text": "edited", "num_edit": 1}}),
            ("messaging_account_linking", {"account_linking": {"status": "linked", "authorization_code": "CODE"}}),
        ],
    )
    def test_known_events(self, expected, item, capsys):
        assert event_type(item) == expected
        payload = body(item)
        assert post(payload, sign(payload)).status_code == 200
        out = capsys.readouterr().out
        assert "Unhandled" not in out and "Ignoring" not in out

    def test_standby_channel(self, capsys):
        payload = body({"read": {"watermark": 5}}, key="standby")
        assert post(payload, sign(payload)).status_code == 200
        assert "read messages up to 5" in capsys.readouterr().out

    def test_unknown_event_and_object_acknowledged(self):
        unknown = body({"something_new": {}})
        assert post(unknown, sign(unknown)).status_code == 200
        ig = json.dumps({"object": "instagram", "entry": []}).encode()
        assert post(ig, sign(ig)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
