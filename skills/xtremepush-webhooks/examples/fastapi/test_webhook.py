import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# The Webhook Secret Key is used as-is, as UTF-8; this one is only for tests
SECRET = "test_xtremepush_webhook_secret_key_5c1e"
os.environ["XTREMEPUSH_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def now() -> str:
    return str(int(time.time()))


def v1_for(body: str, t: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), t.encode() + b"." + body.encode(), hashlib.sha256).hexdigest()


# Xtremepush separates entries with a comma and a space: t=<unix>, v1=<hex>
def sign(body: str, t=None, secret: str = SECRET) -> str:
    t = now() if t is None else t
    return f"t={t}, v1={v1_for(body, t, secret)}"


def send(method: str, body=None, signature=None, content_type="application/json"):
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    if signature is not None:
        headers["X-Xtremepush-Signature"] = signature
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["content"] = body
    return client.request(method, "/webhooks/xtremepush", **kwargs)


def post(body, signature=None, content_type="application/json"):
    return send("POST", body, signature, content_type)


MESSAGE_SEND = json.dumps(
    {"event": "message_send", "time": 1689343556, "properties": {"campaign_id": 12, "user_id": "u-1"}}
)
MESSAGE_DELIVERY = json.dumps(
    {"event": "message_delivery", "time": 1689343560, "properties": {"campaign_id": 12, "user_id": "u-1"}}
)


@pytest.fixture(autouse=True)
def clear_tolerance(monkeypatch):
    monkeypatch.delenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS", raising=False)
    monkeypatch.setenv("XTREMEPUSH_WEBHOOK_SECRET", SECRET)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        r = post(MESSAGE_SEND, sign(MESSAGE_SEND))
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_accepts_header_without_space_after_comma(self):
        t = now()
        assert post(MESSAGE_SEND, f"t={t},v1={v1_for(MESSAGE_SEND, t)}").status_code == 200

    def test_accepts_extra_whitespace_between_entries(self):
        t = now()
        assert post(MESSAGE_SEND, f"t={t},  v1={v1_for(MESSAGE_SEND, t)}").status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND), "text/plain").status_code == 200
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND), "application/octet-stream").status_code == 200

    def test_signs_t_exactly_as_it_appears_in_the_header(self):
        # Re-formatting t as a number would drop the leading zero and break the signature
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, "01689343556")).status_code == 200

    def test_accepts_when_any_v1_matches_key_rotation(self):
        t = now()
        header = f"t={t}, v1={v1_for(MESSAGE_SEND, t, 'old_secret')}, v1={v1_for(MESSAGE_SEND, t)}"
        assert post(MESSAGE_SEND, header).status_code == 200

    def test_accepts_uppercase_hex(self):
        t = now()
        assert post(MESSAGE_SEND, f"t={t}, v1={v1_for(MESSAGE_SEND, t).upper()}").status_code == 200

    def test_ignores_keys_other_than_t_and_v1(self):
        t = now()
        assert post(MESSAGE_SEND, f"t={t}, v0={v1_for(MESSAGE_SEND, t)}").status_code == 401
        assert post(MESSAGE_SEND, f"{sign(MESSAGE_SEND)}, v0=ignored").status_code == 200

    def test_rejects_missing_or_empty_header(self):
        assert post(MESSAGE_SEND).status_code == 401
        assert post(MESSAGE_SEND, "").status_code == 401

    def test_rejects_header_with_no_t_or_no_v1(self):
        t = now()
        assert post(MESSAGE_SEND, f"v1={v1_for(MESSAGE_SEND, t)}").status_code == 401
        assert post(MESSAGE_SEND, f"t={t}").status_code == 401
        assert post(MESSAGE_SEND, f"t=, v1={v1_for(MESSAGE_SEND, t)}").status_code == 401

    def test_rejects_malformed_v1_before_decoding(self):
        t = now()
        good = v1_for(MESSAGE_SEND, t)
        assert post(MESSAGE_SEND, f"t={t}, v1={good[:63]}").status_code == 401
        assert post(MESSAGE_SEND, f"t={t}, v1={good}00").status_code == 401
        assert post(MESSAGE_SEND, f"t={t}, v1=zz{good[2:]}").status_code == 401
        assert post(MESSAGE_SEND, f"t={t}, v1=").status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, secret="wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(MESSAGE_SEND.replace("u-1", "u-2"), sign(MESSAGE_SEND)).status_code == 401

    def test_rejects_reserialised_body(self):
        pretty = json.dumps(json.loads(MESSAGE_SEND), indent=2)
        assert post(pretty, sign(MESSAGE_SEND)).status_code == 401

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("XTREMEPUSH_WEBHOOK_SECRET")
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND)).status_code == 500


class TestTimestampWindow:
    @staticmethod
    def old() -> str:
        return str(int(time.time()) - 3600)

    def test_old_timestamps_accepted_by_default(self):
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, self.old())).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, self.old())).status_code == 200

    def test_rejects_old_timestamps_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, self.old())).status_code == 401
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND)).status_code == 200

    def test_rejects_non_numeric_t_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, "abc")).status_code == 401

    def test_invalid_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        assert post(MESSAGE_SEND, sign(MESSAGE_SEND, self.old())).status_code == 200


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_signed_method(self, method):
        assert send(method, MESSAGE_SEND, sign(MESSAGE_SEND)).status_code == 200

    def test_get_with_no_body_is_verified_over_zero_bytes(self):
        r = send("GET", None, sign(""), content_type=None)
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_rejects_unsigned_get(self):
        assert send("GET", None, None, content_type=None).status_code == 401

    def test_rejects_get_signed_over_a_different_body(self):
        assert send("GET", None, sign(MESSAGE_SEND), content_type=None).status_code == 401

    def test_verified_non_json_body_is_400(self):
        assert post("not json", sign("not json"), "text/plain").status_code == 400


class TestEventHandling:
    def test_handles_message_send(self, caplog):
        with caplog.at_level(logging.INFO, logger="xtremepush-webhooks"):
            assert post(MESSAGE_SEND, sign(MESSAGE_SEND)).status_code == 200
        assert "message_send" in caplog.text

    def test_handles_message_delivery(self, caplog):
        with caplog.at_level(logging.INFO, logger="xtremepush-webhooks"):
            assert post(MESSAGE_DELIVERY, sign(MESSAGE_DELIVERY)).status_code == 200
        assert "message_delivery" in caplog.text

    def test_acknowledges_unknown_events(self, caplog):
        body = json.dumps({"event": "message_open", "time": 1, "properties": {}})
        with caplog.at_level(logging.INFO, logger="xtremepush-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled Xtremepush event: message_open" in caplog.text

    def test_acknowledges_customised_body_without_event(self, caplog):
        body = json.dumps({"type": "sent", "user": "u-1"})
        with caplog.at_level(logging.INFO, logger="xtremepush-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled Xtremepush event: None" in caplog.text

    @pytest.mark.parametrize(
        "value",
        [
            {"event": 5, "properties": {}},
            {"event": {"name": "message_send"}},
            {"event": "message_send", "properties": "oops"},
            {"event": "message_delivery", "properties": [1, 2]},
            {"event": "message_send", "properties": None},
            [{"event": "message_send"}],
            None,
            "message_send",
        ],
    )
    def test_wrong_typed_fields_do_not_fail(self, value):
        body = json.dumps(value)
        assert post(body, sign(body)).status_code == 200
