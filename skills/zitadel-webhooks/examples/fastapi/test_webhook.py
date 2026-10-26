import base64
import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "zitadel_test_signing_key"
os.environ["ZITADEL_WEBHOOK_SECRET"] = SECRET

from main import app, verify_zitadel  # noqa: E402

client = TestClient(app)


def sign(body, secret=SECRET, t=None):
    """Same algorithm as ZITADEL: hex HMAC-SHA256 over '<t>.<raw body>', key = secret as UTF-8 bytes."""
    t = t if t is not None else str(int(time.time()))
    raw = body if isinstance(body, bytes) else body.encode()
    v1 = hmac.new(secret.encode(), t.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return t, v1, f"t={t},v1={v1}"


def post(body, header=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if header is not None:
        headers["zitadel-signature"] = header
    raw = body if isinstance(body, bytes) else body.encode()
    return client.post("/webhooks/zitadel", content=raw, headers=headers)


EVENT_BODY = json.dumps(
    {
        "aggregateID": "336494809936035843",
        "aggregateType": "user",
        "instanceID": "336392597046034435",
        "event_type": "user.human.added",
        "event_payload": {"userName": "mini@mouse.com", "firstName": "Minnie"},
    }
)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("ZITADEL_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(EVENT_BODY, sign(EVENT_BODY)[2])
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_content_type(self):
        assert post(EVENT_BODY, sign(EVENT_BODY)[2], "text/plain").status_code == 200

    def test_verifies_non_normalised_bytes(self):
        body = '{ "event_type" :  "session.added",\n  "aggregateType":"session" }'
        assert post(body, sign(body)[2]).status_code == 200

    def test_verifies_non_utf8_bodies_as_bytes(self):
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert verify_zitadel(body, sign(body)[2], SECRET) is True

    def test_uses_t_exactly_as_sent(self):
        assert post(EVENT_BODY, sign(EVENT_BODY, t="0001700000000")[2]).status_code == 200

    def test_accepts_uppercase_hex(self):
        t, v1, _ = sign(EVENT_BODY)
        assert post(EVENT_BODY, f"t={t},v1={v1.upper()}").status_code == 200

    def test_accepts_when_any_v1_matches_and_ignores_other_keys(self):
        t, v1, _ = sign(EVENT_BODY)
        other = "a" * 64
        assert post(EVENT_BODY, f"t={t},v1={other},v1={v1}").status_code == 200
        assert post(EVENT_BODY, f"t={t},v0={other},v1={v1}").status_code == 200

    def test_rejects_header_with_only_v0(self):
        t, v1, _ = sign(EVENT_BODY)
        assert post(EVENT_BODY, f"t={t},v0={v1}").status_code == 401

    def test_rejects_missing_or_empty_header(self):
        assert post(EVENT_BODY).status_code == 401
        assert post(EVENT_BODY, "").status_code == 401

    def test_rejects_header_without_t(self):
        _, v1, _ = sign(EVENT_BODY)
        assert post(EVENT_BODY, f"v1={v1}").status_code == 401
        assert post(EVENT_BODY, f"t=,v1={v1}").status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(EVENT_BODY, sign(EVENT_BODY, secret="other_key")[2]).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(EVENT_BODY.replace("Minnie", "Mallory"), sign(EVENT_BODY)[2]).status_code == 401

    def test_rejects_different_timestamp_than_signed(self):
        _, v1, _ = sign(EVENT_BODY, t="1700000000")
        assert post(EVENT_BODY, f"t=1700000001,v1={v1}").status_code == 401

    def test_rejects_malformed_signatures(self):
        t, v1, _ = sign(EVENT_BODY)
        for sig in [v1[:62], v1 + "00", "zz" * 32, v1[:62] + "  ", ""]:
            assert post(EVENT_BODY, f"t={t},v1={sig}").status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("ZITADEL_WEBHOOK_SECRET")
        assert post(EVENT_BODY, sign(EVENT_BODY)[2]).status_code == 500


class TestTimestampTolerance:
    OLD = str(int(time.time()) - 3600)

    def test_off_by_default(self):
        assert post(EVENT_BODY, sign(EVENT_BODY, t=self.OLD)[2]).status_code == 200

    @pytest.mark.parametrize("value", ["0", "soon", "-5", "1.5"])
    def test_zero_and_invalid_values_are_off(self, monkeypatch, value):
        monkeypatch.setenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS", value)
        assert post(EVENT_BODY, sign(EVENT_BODY, t=self.OLD)[2]).status_code == 200

    def test_rejects_old_timestamps_when_enabled(self, monkeypatch):
        monkeypatch.setenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(EVENT_BODY, sign(EVENT_BODY, t=self.OLD)[2]).status_code == 401

    def test_accepts_fresh_timestamps_when_enabled(self, monkeypatch):
        monkeypatch.setenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(EVENT_BODY, sign(EVENT_BODY)[2]).status_code == 200

    def test_rejects_non_numeric_t_when_enabled(self, monkeypatch):
        monkeypatch.setenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(EVENT_BODY, sign(EVENT_BODY, t="yesterday")[2]).status_code == 401


class TestPayloadHandling:
    @staticmethod
    def send(obj):
        body = obj if isinstance(obj, str) else json.dumps(obj)
        return post(body, sign(body)[2])

    def test_handles_event_executions(self, caplog):
        caplog.set_level(logging.INFO, logger="zitadel-webhooks")
        assert self.send(EVENT_BODY).status_code == 200
        assert "Human user added (user/336494809936035843): mini@mouse.com" in caplog.text
        self.send({"event_type": "session.added", "aggregateType": "session", "aggregateID": "s1"})
        assert "Session added (session/s1)" in caplog.text

    def test_decodes_base64_event_payload(self, caplog):
        caplog.set_level(logging.INFO, logger="zitadel-webhooks")
        encoded = base64.b64encode(json.dumps({"userName": "b64@example.com"}).encode()).decode()
        self.send({"event_type": "user.human.added", "aggregateType": "user", "aggregateID": "u1", "event_payload": encoded})
        assert "Human user added (user/u1): b64@example.com" in caplog.text

    def test_handles_request_response_and_function_executions(self, caplog):
        caplog.set_level(logging.INFO, logger="zitadel-webhooks")
        assert self.send({"fullMethod": "/zitadel.user.v2.UserService/CreateUser"}).status_code == 200
        assert "Request/response execution: /zitadel.user.v2.UserService/CreateUser" in caplog.text
        assert self.send({"function": "function/preuserinfo"}).status_code == 200
        assert "Function execution: function/preuserinfo" in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        caplog.set_level(logging.INFO, logger="zitadel-webhooks")
        assert self.send({"event_type": "org.added"}).status_code == 200
        assert "Unhandled event: org.added" in caplog.text

    def test_400_for_signed_non_json(self):
        assert self.send("not json").status_code == 400

    @pytest.mark.parametrize("body", ["[1,2]", "null", '"text"'])
    def test_400_when_json_is_not_an_object(self, body):
        assert self.send(body).status_code == 400

    @pytest.mark.parametrize(
        "obj",
        [
            {"event_type": 5},
            {"event_type": "user.human.added", "event_payload": 7},
            {"event_type": "user.human.added", "event_payload": ["x"]},
            {"event_type": "user.human.added", "event_payload": "%%%not-base64-json%%%"},
            {"event_type": "user.human.added", "event_payload": {"userName": {"a": 1}}, "aggregateType": [], "aggregateID": {}},
            {"fullMethod": ["x"]},
            {"function": {"a": 1}},
            {},
        ],
    )
    def test_never_500s_on_wrong_typed_fields(self, obj):
        assert self.send(obj).status_code == 200
