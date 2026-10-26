import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Lettermint secrets look like whsec_... and are used whole, as a plain UTF-8 HMAC key
SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2xldHRlcm1pbnQ"
os.environ["LETTERMINT_WEBHOOK_SECRET"] = SECRET

from main import app, verify_lettermint_webhook  # noqa: E402

client = TestClient(app)


def now() -> int:
    return int(time.time())


def v1(body: bytes, secret: str = SECRET, t: str | None = None) -> str:
    t = t if t is not None else str(now())
    return hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET, t: str | None = None) -> str:
    t = t if t is not None else str(now())
    return f"t={t},v1={v1(body, secret, t)}"


def envelope(event: str, data: dict, **extra) -> dict:
    return {"id": "9b0c4a4e-4e29-4d8b-8b3a-3f0f3e6d2f9b", "event": event, "timestamp": "2025-08-08T20:15:12.000Z", **extra, "data": data}


# Payloads based on the sample payloads in Lettermint's webhook events documentation
MESSAGE_DATA = {
    "message_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "subject": "Your order has shipped",
    "recipient": "user@example.com",
    "metadata": {"X-Transaction-ID": "txn-456"},
    "tag": "order-confirmation",
    "tags": [{"name": "__lettermint_tag", "value": "order-confirmation"}],
}
SAMPLES = {
    "message.delivered": envelope(
        "message.delivered",
        {**MESSAGE_DATA, "response": {"status_code": 250, "enhanced_status_code": "2.0.0", "content": "OK  1640705112 qp1355551phe.1 - gsmtp"}},
        sandbox=False,
        sandbox_result=None,
    ),
    "message.hard_bounced": envelope("message.hard_bounced", MESSAGE_DATA),
    "message.soft_bounced": envelope("message.soft_bounced", MESSAGE_DATA),
    "message.spam_complaint": envelope("message.spam_complaint", MESSAGE_DATA),
    "message.failed": envelope(
        "message.failed",
        {**MESSAGE_DATA, "reason": "5.7.10 Encryption needed: recipient did not offer STARTTLS", "reason_code": "enforced_tls_failed", "response": {"status_code": 550}},
    ),
    "suppression.added": envelope(
        "suppression.added",
        {"suppression_id": "1d74d4c9-8492-4f5f-ae3f-f6fd671399ea", "type": "email", "value": "suppressed@example.com", "reason": "hard_bounce", "applies_to": "all"},
        context={"scope": "team", "team_id": "9f4e3d2c-1b0a-4987-9654-3210fedcba98", "project_id": None, "route_id": None},
    ),
    "webhook.test": envelope(
        "webhook.test",
        {"message": "This is a test webhook from Lettermint", "webhook_id": "9f9bf19c-4a2c-45f3-a6c7-bc937224ec5a", "timestamp": 1754921294},
    ),
}


def post(body: bytes, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header is not None:
        headers["X-Lettermint-Signature"] = header
    return client.post("/webhooks/lettermint", content=body, headers=headers)


class TestVerify:
    body = json.dumps(SAMPLES["message.delivered"]).encode()

    def test_accepts_valid_signature(self):
        assert verify_lettermint_webhook(self.body, sign(self.body), SECRET, 0)

    def test_uses_whole_secret_including_prefix(self):
        import base64

        t = str(now())
        rest = SECRET[len("whsec_"):]
        stripped = hmac.new(rest.encode(), t.encode() + b"." + self.body, hashlib.sha256).hexdigest()
        decoded = hmac.new(base64.b64decode(rest + "=" * (-len(rest) % 4)), t.encode() + b"." + self.body, hashlib.sha256).hexdigest()
        assert not verify_lettermint_webhook(self.body, f"t={t},v1={stripped}", SECRET, 0)
        assert not verify_lettermint_webhook(self.body, f"t={t},v1={decoded}", SECRET, 0)

    def test_rejects_wrong_secret_and_tampered_body(self):
        assert not verify_lettermint_webhook(self.body, sign(self.body, "whsec_other"), SECRET, 0)
        assert not verify_lettermint_webhook(b'{"tampered":true}', sign(self.body), SECRET, 0)

    def test_rejects_header_signed_over_different_t(self):
        header = f"t=1700000001,v1={v1(self.body, SECRET, '1700000000')}"
        assert not verify_lettermint_webhook(self.body, header, SECRET, 0)

    @pytest.mark.parametrize("header", [None, "", "garbage", "t=,v1=" + "a" * 64])
    def test_rejects_missing_empty_and_t_less_headers(self, header):
        assert not verify_lettermint_webhook(self.body, header, SECRET, 0)
        assert not verify_lettermint_webhook(self.body, f"v1={v1(self.body)}", SECRET, 0)

    def test_rejects_malformed_v1_without_raising(self):
        t = str(now())
        good = v1(self.body, SECRET, t)
        for bad in ["", "abc", "z" * 64, good[:63], good + "0", good[:62] + "\n\n", " " + good + "x", "é" * 64]:
            assert not verify_lettermint_webhook(self.body, f"t={t},v1={bad}", SECRET, 0)
        assert not verify_lettermint_webhook(self.body, f"t={t}", SECRET, 0)

    def test_hex_is_case_insensitive(self):
        t = str(now())
        assert verify_lettermint_webhook(self.body, f"t={t},v1={v1(self.body, SECRET, t).upper()}", SECRET, 0)

    def test_any_v1_may_match_and_other_keys_are_ignored(self):
        t = str(now())
        good, wrong = v1(self.body, SECRET, t), v1(self.body, "whsec_old", t)
        assert verify_lettermint_webhook(self.body, f"t={t},v1={wrong},v1={good}", SECRET, 0)
        assert verify_lettermint_webhook(self.body, f"t={t},v1={good},v1={wrong}", SECRET, 0)
        assert not verify_lettermint_webhook(self.body, f"t={t},v0={good}", SECRET, 0)
        assert verify_lettermint_webhook(self.body, f"t={t},v0=deadbeef,v1={good}", SECRET, 0)

    def test_verifies_exact_bytes(self):
        raw = '{ "id": "x",  "event": "message.delivered", "data": {"subject": "café https://a/b"} }'.encode()
        assert verify_lettermint_webhook(raw, sign(raw), SECRET, 0)
        reserialized = json.dumps(json.loads(raw)).encode()
        assert not verify_lettermint_webhook(reserialized, sign(raw), SECRET, 0)
        binary = b"{\xff\xfe}"  # invalid UTF-8 stays byte-exact
        assert verify_lettermint_webhook(binary, sign(binary), SECRET, 0)

    def test_timestamp_window_is_off_by_default(self):
        t = 1_754_921_294
        header = sign(self.body, SECRET, str(t))
        assert verify_lettermint_webhook(self.body, header, SECRET, 0, now=t + 86_400)

    def test_timestamp_window_when_on(self):
        t = 1_754_921_294
        header = sign(self.body, SECRET, str(t))
        assert not verify_lettermint_webhook(self.body, header, SECRET, 300, now=t + 301)
        assert not verify_lettermint_webhook(self.body, header, SECRET, 300, now=t - 301)
        assert verify_lettermint_webhook(self.body, header, SECRET, 300, now=t + 299)
        assert verify_lettermint_webhook(self.body, header, SECRET, 300, now=t - 299)

    def test_window_requires_numeric_t(self):
        assert not verify_lettermint_webhook(self.body, sign(self.body, SECRET, "abc"), SECRET, 300, now=0)

    def test_tolerance_read_from_env(self, monkeypatch):
        old = sign(self.body, SECRET, "1700000000")
        monkeypatch.setenv("LETTERMINT_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert not verify_lettermint_webhook(self.body, old, SECRET)
        monkeypatch.delenv("LETTERMINT_WEBHOOK_TOLERANCE_SECONDS")
        assert verify_lettermint_webhook(self.body, old, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("name", list(SAMPLES))
    def test_accepts_signed_event(self, name, capsys):
        body = json.dumps(SAMPLES[name]).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in capsys.readouterr().out

    def test_logs_and_accepts_unhandled_events(self, capsys):
        body = json.dumps(envelope("message.clicked", MESSAGE_DATA)).encode()
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event type: message.clicked" in capsys.readouterr().out

    @pytest.mark.parametrize("content_type", ["text/plain", "application/vnd.api+json"])
    def test_verifies_bytes_whatever_the_content_type(self, content_type):
        body = json.dumps(SAMPLES["message.delivered"]).encode()
        assert post(body, sign(body), content_type).status_code == 200

    def test_accepts_body_json_dumps_would_change(self):
        body = b'{ "id": "x",  "event": "webhook.test", "data": {} }'
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize("header", [None, "", "garbage", "t=%d,v1=%s" % (now(), "g" * 64)])
    def test_401_for_missing_or_malformed_header(self, header):
        body = json.dumps(SAMPLES["webhook.test"]).encode()
        assert post(body, header).status_code == 401

    def test_401_for_wrong_secret_or_tampered_body(self):
        body = json.dumps(SAMPLES["webhook.test"]).encode()
        assert post(body, sign(body, "whsec_other")).status_code == 401
        assert post(body + b" ", sign(body)).status_code == 401

    def test_400_for_valid_signature_over_invalid_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400

    def test_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("LETTERMINT_WEBHOOK_SECRET")
        body = json.dumps(SAMPLES["webhook.test"]).encode()
        assert post(body, sign(body)).status_code == 500

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
