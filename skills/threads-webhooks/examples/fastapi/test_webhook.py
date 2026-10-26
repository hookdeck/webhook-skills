import os
import hmac
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

APP_SECRET = "test_app_secret"
VERIFY_TOKEN = "test_verify_token"

os.environ["THREADS_APP_SECRET"] = APP_SECRET
os.environ["THREADS_VERIFY_TOKEN"] = VERIFY_TOKEN

from main import app  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = APP_SECRET) -> str:
    """Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>."""
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def notification(field: str, value: dict, topic: str = "moderate") -> bytes:
    return json.dumps(
        {
            "app_id": "123456",
            "topic": topic,
            "target_id": "78901",
            "time": 1723226877,
            "subscription_id": "234567",
            "has_uid_field": False,
            "values": {"value": value, "field": field},
        }
    ).encode()


def post(body: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Hub-Signature-256"] = signature
    return client.post("/webhooks/threads", content=body, headers=headers)


REPLY = notification(
    "replies", {"id": "8901234", "username": "test_username", "replied_to": {"id": "567890"}}
)


class TestHandshake:
    def test_echoes_challenge(self):
        res = client.get(
            "/webhooks/threads",
            params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444"},
        )
        assert res.status_code == 200
        assert res.text == "1158201444"

    def test_wrong_token(self):
        res = client.get(
            "/webhooks/threads",
            params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1"},
        )
        assert res.status_code == 403

    def test_missing_token(self):
        res = client.get("/webhooks/threads", params={"hub.mode": "subscribe", "hub.challenge": "1"})
        assert res.status_code == 403


class TestSignature:
    def test_valid(self):
        assert post(REPLY, sign(REPLY)).status_code == 200

    def test_uppercase_hex(self):
        sig = "sha256=" + sign(REPLY)[7:].upper()
        assert post(REPLY, sig).status_code == 200

    def test_any_content_type(self):
        assert post(REPLY, sign(REPLY), "text/plain").status_code == 200

    def test_non_ascii_body(self):
        body = notification("mentions", {"id": "1", "username": "u", "text": "héllo 🧵"}, "interaction")
        assert post(body, sign(body)).status_code == 200

    def test_missing_header(self):
        assert post(REPLY).status_code == 401

    def test_wrong_secret(self):
        assert post(REPLY, sign(REPLY, "other_secret")).status_code == 401

    def test_tampered_body(self):
        assert post(REPLY.replace(b"8901234", b"9999999"), sign(REPLY)).status_code == 401

    def test_missing_prefix(self):
        assert post(REPLY, sign(REPLY)[7:]).status_code == 401

    def test_legacy_sha1_prefix(self):
        assert post(REPLY, "sha1=" + sign(REPLY)[7:]).status_code == 401

    def test_bad_digest_lengths_and_chars(self):
        digest = sign(REPLY)[7:]
        assert post(REPLY, "sha256=" + digest[:40]).status_code == 401
        assert post(REPLY, "sha256=" + digest[:62] + "zz").status_code == 401
        assert post(REPLY, "sha256=" + digest + "ab").status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/threads",
            content=REPLY,
            headers={"X-Hub-Signature-256": "sha256=é".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_signed_non_json(self):
        assert post(b"not json", sign(b"not json"), "text/plain").status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "field,value,topic",
        [
            ("replies", {"id": "1", "username": "u", "replied_to": {"id": "2"}}, "moderate"),
            ("mentions", {"id": "1", "username": "u"}, "interaction"),
            ("publish", {"id": "1", "username": "u"}, "interaction"),
            ("delete", {"id": "1", "deleted_at": "2024-08-07T10:33:16+0000"}, "moderate"),
        ],
    )
    def test_known_fields(self, field, value, topic, capsys):
        body = notification(field, value, topic)
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_field_acknowledged(self):
        body = notification("something_else", {})
        assert post(body, sign(body)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
