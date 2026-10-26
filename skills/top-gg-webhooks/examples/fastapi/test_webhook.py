import hashlib
import hmac
import json
import os
import time

# Top.gg v1 secrets start with whs_ but are used WHOLE as UTF-8 key bytes (no decoding)
SECRET = "whs_9f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d"
os.environ["TOP_GG_WEBHOOK_SECRET"] = SECRET
os.environ.pop("TOP_GG_WEBHOOK_TOLERANCE_SECONDS", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_top_gg_webhook  # noqa: E402

client = TestClient(app)

USER = {"id": "top.gg id", "platform_id": "discord id", "name": "username", "avatar_url": "https://example.com/a.png"}
PROJECT = {"id": "803190510032756736", "type": "bot", "platform": "discord", "platform_id": "160105994217586689"}
VOTE = {
    "type": "vote.create",
    "data": {
        "id": "808499215864008704",
        "weight": 1,
        "created_at": "2026-02-09T00:47:14.2510149+00:00",
        "expires_at": "2026-02-09T12:47:14.2510149+00:00",
        "project": PROJECT,
        "query": {"key1": "value"},
        "user": USER,
    },
}
TEST_EVENT = {"type": "webhook.test", "data": {"user": USER, "project": PROJECT}}


def now_t() -> str:
    return str(int(time.time()))


def v1(body: bytes, secret: str = SECRET, t: str | None = None) -> str:
    """hex(HMAC-SHA256(secret, f"{t}." + raw body bytes)); `t` stays a string, exactly as sent."""
    t = t if t is not None else now_t()
    return hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET, t: str | None = None) -> str:
    t = t if t is not None else now_t()
    return f"t={t},v1={v1(body, secret, t)}"


def post(body: bytes | str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-topgg-signature"] = signature
    return client.post("/webhooks/top-gg", content=body, headers=headers)


def dumps(obj) -> bytes:
    return json.dumps(obj).encode()


class TestWebhookEndpoint:
    def test_accepts_vote_create(self, capsys):
        body = dumps(VOTE)
        assert post(body, sign(body)).status_code == 200
        assert "Vote 808499215864008704" in capsys.readouterr().out

    def test_accepts_webhook_test(self, capsys):
        body = dumps(TEST_EVENT)
        assert post(body, sign(body)).status_code == 200
        assert "Test webhook" in capsys.readouterr().out

    def test_logs_and_acknowledges_unknown_event_types(self, capsys):
        body = dumps({"type": "vote.expire", "data": {}})
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event type: vote.expire" in capsys.readouterr().out

    def test_verifies_any_content_type(self):
        body = dumps(VOTE)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_missing_and_empty_signature_header(self):
        body = dumps(VOTE)
        assert post(body).status_code == 401
        assert post(body, "").status_code == 401

    def test_wrong_secret_tampered_body_and_tampered_timestamp(self):
        body = dumps(VOTE)
        t = now_t()
        assert post(body, sign(body, "whs_wrong")).status_code == 401
        assert post(dumps({**VOTE, "type": "webhook.test"}), sign(body)).status_code == 401
        assert post(body, f"t={int(t) + 1},v1={v1(body, SECRET, t)}").status_code == 401

    def test_header_without_t_or_v1_value(self):
        body = dumps(VOTE)
        assert post(body, f"v1={v1(body)}").status_code == 401
        assert post(body, f"t=,v1={v1(body)}").status_code == 401
        assert post(body, "t=1700000000").status_code == 401
        assert post(body, "t=1700000000,v1=").status_code == 401

    def test_rejects_signatures_that_are_not_exactly_64_hex_characters(self):
        body = dumps(VOTE)
        good = v1(body)
        t = now_t()
        for bad in (good[:62], good + "00", good[:62] + "zz", good[:63] + " ", "0x" + good[2:]):
            assert post(body, f"t={t},v1={bad}").status_code == 401

    def test_rejects_non_ascii_digits_in_signature(self):
        # httpx cannot send non-ASCII headers, so call the verifier directly
        body = dumps(VOTE)
        t = now_t()
        bad = v1(body, SECRET, t)[:63] + "\u0663"
        assert not verify_top_gg_webhook(body, f"t={t},v1={bad}", SECRET)

    def test_accepts_uppercase_hex(self):
        body = dumps(VOTE)
        t = now_t()
        assert post(body, f"t={t},v1={v1(body, SECRET, t).upper()}").status_code == 200

    def test_any_v1_entry_may_match_and_other_keys_are_ignored(self):
        body = dumps(VOTE)
        t = now_t()
        stale = v1(body, "whs_old_secret", t)
        assert post(body, f"t={t}, v1={stale}, v1={v1(body, SECRET, t)}, v0=abc").status_code == 200
        assert post(body, f"v0={v1(body)},t={t},v1={v1(body, SECRET, t)}").status_code == 200
        assert post(body, f"t={t},v1={stale},v0={v1(body, SECRET, t)}").status_code == 401

    def test_uses_t_exactly_as_sent(self):
        body = dumps(VOTE)
        t = "00" + now_t()
        assert post(body, f"t={t},v1={v1(body, SECRET, t)}").status_code == 200

    def test_verifies_raw_bytes_including_non_utf8(self):
        body = b'{"type":"vote.create","data":{"x":"\xff\xfe"}}'
        # Valid signature passes verification; the body is then not valid UTF-8 JSON
        assert post(body, sign(body), "application/octet-stream").status_code == 400

    @pytest.mark.parametrize("body", [b"not json", b"[]", b'"text"', b"null", b"42"])
    def test_signed_body_that_is_not_a_json_object_is_400(self, body):
        assert post(body, sign(body)).status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"type": "vote.create", "data": "x"},
            {"type": "vote.create", "data": {"user": 5, "project": [], "id": 7, "weight": "heavy"}},
            {"type": "vote.create", "data": {"weight": True}},
            {"type": "webhook.test", "data": None},
            {"type": {"nested": True}, "data": []},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, payload):
        body = dumps(payload)
        assert post(body, sign(body)).status_code == 200

    def test_missing_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("TOP_GG_WEBHOOK_SECRET")
        body = dumps(VOTE)
        assert post(body, sign(body)).status_code == 500

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}


class TestTimestampWindow:
    body = dumps(VOTE)
    now = 1_800_000_000.0
    old = str(int(now) - 3600)

    def test_old_timestamps_accepted_by_default(self):
        assert verify_top_gg_webhook(self.body, sign(self.body, SECRET, self.old), SECRET, 0, self.now)

    def test_old_timestamps_rejected_when_tolerance_set(self):
        assert not verify_top_gg_webhook(self.body, sign(self.body, SECRET, self.old), SECRET, 300, self.now)
        fresh = str(int(self.now) - 10)
        assert verify_top_gg_webhook(self.body, sign(self.body, SECRET, fresh), SECRET, 300, self.now)

    def test_non_numeric_t_rejected_when_tolerance_set(self):
        assert not verify_top_gg_webhook(self.body, sign(self.body, SECRET, "abc"), SECRET, 300, self.now)

    def test_tolerance_from_env(self, monkeypatch):
        header = sign(self.body, SECRET, self.old)
        monkeypatch.setenv("TOP_GG_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert not verify_top_gg_webhook(self.body, header, SECRET, now=self.now)
        monkeypatch.delenv("TOP_GG_WEBHOOK_TOLERANCE_SECONDS")
        assert verify_top_gg_webhook(self.body, header, SECRET, now=self.now)
