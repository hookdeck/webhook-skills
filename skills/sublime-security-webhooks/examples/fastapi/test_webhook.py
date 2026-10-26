import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Sublime webhook Action signing secrets are opaque strings; this one is only for tests
SECRET = "test_sublime_secret_5f0c1a7e"
os.environ["SUBLIME_SECURITY_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("SUBLIME_SECURITY_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def mac(timestamp, body: str, secret=SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    """Matches Sublime's header format: t=<unix seconds>,v0=<hex> (no space)."""
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v0={mac(ts, body, secret)}"


def event(event_type: str = "message.flagged") -> str:
    # Based on the message.flagged sample in Sublime's webhook docs
    return json.dumps(
        {
            "id": "5e02026c-55c1-4cbb-8a18-76eb2f3e06d3",
            "api_version": "0",
            "created_at": "2021-06-30T16:17:22.937642Z",
            "type": event_type,
            "data": {
                "message": {
                    "id": "dff3be1d-b348-4dab-bb60-582842909a88",
                    "canonical_id": "767f6519458092af9994a79ae73ca055e1365618",
                    "external_id": "17a5db5ea7fa760d",
                    "message_source_id": "a5843e7d-4ba5-40df-954e-73cb2f1e3e7e",
                    "mailbox": {
                        "id": "f0654b68-2686-491e-8fcb-e4ad61c61ad8",
                        "external_id": "109412126579921477721",
                    },
                },
                "classification": "malicious",
                "flagged_rules": [
                    {
                        "id": "756b841c-4560-49b3-a8c0-dbacb2900aa5",
                        "name": "Brand impersonation: Internal Revenue Service",
                        "severity": "high",
                        "tags": ["brand-impersonation", "suspicious-sender"],
                    }
                ],
                "triggered_actions": [
                    {"id": "6f45c807-a9c7-47a8-8c3e-5391e4f477ca", "name": "Auto-trash", "type": "trash_message"}
                ],
            },
        }
    )


def post(body: str, headers: dict = None, content_type="application/json"):
    return client.post(
        "/webhooks/sublime-security",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_v0_signature(self):
        body = event()
        res = post(body, {"X-Sublime-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_match_on_any_v0_value(self):
        body = event()
        ts = int(time.time())
        header = f"t={ts},v0={'0' * 64},v0={mac(ts, body)}"
        assert post(body, {"X-Sublime-Signature": header}).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = event()
        ts = int(time.time())
        header = f"t={ts},v0={mac(ts, body).upper()}"
        assert post(body, {"X-Sublime-Signature": header}).status_code == 200

    def test_ignores_unknown_signature_schemes(self):
        body = event()
        ts = int(time.time())
        header = f"t={ts},v1={mac(ts, body)}"
        assert post(body, {"X-Sublime-Signature": header}).status_code == 401

    def test_accepts_any_content_type(self):
        body = event()
        res = post(body, {"X-Sublime-Signature": sign(body)}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_wrong_secret(self):
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body, secret="wrong_secret")}).status_code == 401

    def test_rejects_tampered_body(self):
        res = post(event("manual"), {"X-Sublime-Signature": sign(event("message.flagged"))})
        assert res.status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event()
        header = sign(body, timestamp=int(time.time()))
        ts = header.split(",")[0]
        tampered = header.replace(ts, f"t={int(ts[2:]) + 1}")
        assert post(body, {"X-Sublime-Signature": tampered}).status_code == 401

    def test_rejects_missing_header(self):
        assert post(event()).status_code == 401

    def test_rejects_non_hex_signature_of_correct_length(self):
        header = f"t={int(time.time())},v0={'z' * 64}"
        assert post(event(), {"X-Sublime-Signature": header}).status_code == 401

    def test_rejects_valid_signature_with_trailing_characters(self):
        body = event()
        ts = int(time.time())
        header = f"t={ts},v0={mac(ts, body)}zz"
        assert post(body, {"X-Sublime-Signature": header}).status_code == 401

    @pytest.mark.parametrize("t", ["0", "-5", "1.5", "+12", " ", "abc"])
    def test_rejects_bad_timestamp(self, t):
        body = event()
        header = f"t={t},v0={mac(t, body)}"
        assert post(body, {"X-Sublime-Signature": header}).status_code == 401

    @pytest.mark.parametrize("header", ["garbage", "t=abc,v0=deadbeef", "t=123", "v0=deadbeef", "t=123,v0=short"])
    def test_rejects_malformed_header(self, header):
        assert post(event(), {"X-Sublime-Signature": header}).status_code == 401

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("SUBLIME_SECURITY_WEBHOOK_SECRET")
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body)}).status_code == 500


class TestTimestampTolerance:
    OLD = int(time.time()) - 3600

    def test_off_by_default(self):
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body, timestamp=self.OLD)}).status_code == 200

    def test_rejects_old_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body, timestamp=self.OLD)}).status_code == 401

    def test_accepts_fresh_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body)}).status_code == 200

    @pytest.mark.parametrize("value", ["five minutes", "-1", "1.5"])
    def test_invalid_value_is_off(self, monkeypatch, value):
        monkeypatch.setenv("SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS", value)
        body = event()
        assert post(body, {"X-Sublime-Signature": sign(body, timestamp=self.OLD)}).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize("event_type", ["message.flagged", "group", "manual"])
    def test_handles_event(self, event_type, caplog):
        caplog.set_level("INFO")
        body = event(event_type)
        res = post(body, {"X-Sublime-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_type(self, caplog):
        caplog.set_level("INFO")
        body = event("something.new")
        res = post(body, {"X-Sublime-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled event type: something.new" in caplog.text

    def test_rejects_signed_non_json_body(self):
        body = "not json"
        assert post(body, {"X-Sublime-Signature": sign(body)}).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
