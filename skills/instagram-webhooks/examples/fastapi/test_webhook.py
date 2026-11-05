import os
import hmac
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

APP_SECRET = "test_app_secret"
VERIFY_TOKEN = "test_verify_token"

os.environ["INSTAGRAM_APP_SECRET"] = APP_SECRET
os.environ["INSTAGRAM_VERIFY_TOKEN"] = VERIFY_TOKEN

from main import app  # noqa: E402

client = TestClient(app)

ACCOUNT_ID = "17841405726653026"


def sign(payload: bytes, secret: str = APP_SECRET) -> str:
    """Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>."""
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def change_body(field: str, value: dict, ensure_ascii: bool = False) -> bytes:
    return json.dumps(
        {"object": "instagram", "entry": [{"id": ACCOUNT_ID, "time": 1520622968, "changes": [{"field": field, "value": value}]}]},
        ensure_ascii=ensure_ascii,
    ).encode("utf-8")


def messaging_body(item: dict, key: str = "messaging") -> bytes:
    event = {"sender": {"id": "IGSID"}, "recipient": {"id": ACCOUNT_ID}, "timestamp": 1569262485349, **item}
    return json.dumps(
        {"object": "instagram", "entry": [{"id": ACCOUNT_ID, "time": 1569262486134, key: [event]}]}
    ).encode()


def post(body: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Hub-Signature-256"] = signature
    return client.post("/webhooks/instagram", content=body, headers=headers)


COMMENT = change_body(
    "comments",
    {
        "id": "17865799348089039",
        "from": {"id": "1234567890", "username": "test_user"},
        "text": "Nice post",
        "media": {"id": "17918195224117851", "media_product_type": "FEED"},
    },
)

# Meta signs an escaped-unicode payload: "äöå" arrives as "\u00e4\u00f6\u00e5".
ESCAPED = change_body("comments", {"id": "1", "text": "äöå"}, ensure_ascii=True)


class TestHandshake:
    def test_echoes_challenge(self):
        res = client.get(
            "/webhooks/instagram",
            params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444"},
        )
        assert res.status_code == 200
        assert res.text == "1158201444"

    def test_wrong_token(self):
        res = client.get(
            "/webhooks/instagram",
            params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1"},
        )
        assert res.status_code == 403

    def test_missing_token(self):
        res = client.get("/webhooks/instagram", params={"hub.mode": "subscribe", "hub.challenge": "1"})
        assert res.status_code == 403


class TestSignature:
    def test_valid(self):
        assert post(COMMENT, sign(COMMENT)).status_code == 200

    def test_uppercase_hex(self):
        assert post(COMMENT, "sha256=" + sign(COMMENT)[7:].upper()).status_code == 200

    def test_any_content_type(self):
        assert post(COMMENT, sign(COMMENT), "text/plain").status_code == 200

    def test_escaped_unicode_bytes(self):
        assert b"\\u00e4\\u00f6\\u00e5" in ESCAPED
        assert post(ESCAPED, sign(ESCAPED)).status_code == 200

    def test_signature_over_decoded_unicode_fails(self):
        decoded = json.dumps(json.loads(ESCAPED), ensure_ascii=False).encode("utf-8")
        assert decoded != ESCAPED
        assert post(ESCAPED, sign(decoded)).status_code == 401

    def test_raw_utf8_body(self):
        body = change_body("comments", {"id": "1", "text": "héllo 📸"})
        assert post(body, sign(body)).status_code == 200

    def test_missing_header(self):
        assert post(COMMENT).status_code == 401

    def test_wrong_secret(self):
        assert post(COMMENT, sign(COMMENT, "other_secret")).status_code == 401

    def test_tampered_body(self):
        assert post(COMMENT.replace(b"Nice", b"Mean"), sign(COMMENT)).status_code == 401

    def test_missing_prefix(self):
        assert post(COMMENT, sign(COMMENT)[7:]).status_code == 401

    def test_legacy_sha1_prefix(self):
        assert post(COMMENT, "sha1=" + sign(COMMENT)[7:]).status_code == 401

    def test_bad_digest_lengths_and_chars(self):
        digest = sign(COMMENT)[7:]
        assert post(COMMENT, "sha256=" + digest[:40]).status_code == 401
        assert post(COMMENT, "sha256=" + digest[:62] + "zz").status_code == 401
        assert post(COMMENT, "sha256=" + digest + "ab").status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/instagram",
            content=COMMENT,
            headers={"X-Hub-Signature-256": "sha256=é".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_signed_non_json(self):
        assert post(b"not json", sign(b"not json"), "text/plain").status_code == 400

    def test_signed_non_object_json(self):
        assert post(b"42", sign(b"42")).status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "body",
        [
            change_body("comments", {"id": "1", "from": {"username": "u"}, "media": {"id": "2"}}),
            change_body("comments", {"comment_id": "1", "from": {"username": "u"}, "media": {"id": "2"}}),
            change_body("live_comments", {"comment_id": "1", "from": {"username": "u"}, "media": {"id": "2"}}),
            change_body("mentions", {"media_id": "1"}),
            change_body("mentions", {"media_id": "1", "comment_id": "2"}),
            change_body("story_insights", {"media_id": "1", "impressions": 44, "reach": 40, "exits": -1}),
            messaging_body({"message": {"mid": "MID", "text": "Hi"}}),
            messaging_body({"message": {"mid": "MID", "attachments": [{"type": "ig_reel", "payload": {"url": "https://x"}}]}}),
            messaging_body({"message": {"mid": "MID", "text": "Hi", "is_echo": True}}),
            messaging_body({"message": {"mid": "MID", "is_deleted": True}}),
            messaging_body({"message": {"admin_text": "Needs a human", "handoff_reason": "human_requested"}}),
            messaging_body({"reaction": {"mid": "MID", "action": "react", "reaction": "love", "emoji": "❤️"}}),
            messaging_body({"postback": {"mid": "MID", "title": "Hours?", "payload": "HOURS"}}),
            messaging_body({"referral": {"ref": "promo", "source": "https://ig.me/x", "type": "OPEN_THREAD"}}),
            messaging_body({"read": {"mid": "MID"}}),
            messaging_body({"message_edit": {"mid": "MID", "text": "edited", "num_edit": 1}}),
            messaging_body({"message": {"mid": "MID", "text": "Hi"}}, "standby"),
        ],
    )
    def test_known_events(self, body, capsys):
        assert post(body, sign(body)).status_code == 200
        out = capsys.readouterr().out
        assert "Unhandled" not in out and "Ignoring" not in out

    def test_array_wrapped_notification(self):
        body = b"[" + COMMENT + b"]"
        assert post(body, sign(body)).status_code == 200

    def test_unknown_field_and_object_acknowledged(self):
        body = change_body("something_else", {})
        assert post(body, sign(body)).status_code == 200
        page = json.dumps({"object": "page", "entry": []}).encode()
        assert post(page, sign(page)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
