import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "my-secret-hmac-key"
os.environ["GREENSHADES_WEBHOOK_SECRET"] = SECRET

from main import app, build_signed_content  # noqa: E402

client = TestClient(app)

TS = "2026-10-26T12:00:00Z"
BODY = json.dumps({"eventName": "employee.updated", "employeeId": 42}).encode()


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Independent signer: HMAC-SHA256 over timestamp + LF + body, lowercase hex."""
    msg = timestamp.encode("latin-1") + bytes([0x0A]) + body
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def signed(body: bytes, ts: str = TS) -> dict:
    return {"X-GS-TIMESTAMP": ts, "X-GS-SIGNATURE": sign(body, ts)}


def send(method: str, body: bytes, headers: dict, content_type: str = "application/json"):
    return client.request(
        method,
        "/webhooks/greenshades",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("GREENSHADES_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("GREENSHADES_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_signed_content_uses_real_newline_byte():
    content = build_signed_content(TS, BODY)
    assert b"\x0a" in content
    assert b"\\n" not in content
    assert content == TS.encode() + b"\n" + BODY


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
def test_accepts_signed_request(method):
    res = send(method, BODY, signed(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize("method", ["GET", "DELETE"])
def test_accepts_signed_request_with_empty_body(method):
    res = send(method, b"", signed(b""))
    assert res.status_code == 200


def test_accepts_any_content_type():
    body = b'{"eventName":"payRun.completed"}'
    assert send("POST", body, signed(body), "text/plain").status_code == 200


def test_accepts_uppercase_hex():
    h = signed(BODY)
    h["X-GS-SIGNATURE"] = h["X-GS-SIGNATURE"].upper()
    assert send("POST", BODY, h).status_code == 200


def test_signs_utf8_body_bytes_for_non_ascii_body():
    body = json.dumps({"eventName": "employee.added", "name": "Zoë Müller"}, ensure_ascii=False).encode("utf-8")
    assert send("POST", body, signed(body)).status_code == 200


def test_unhandled_event_is_accepted():
    body = b'{"eventName":"something.else"}'
    assert send("POST", body, signed(body)).status_code == 200


def test_rejects_missing_signature():
    assert send("POST", BODY, {"X-GS-TIMESTAMP": TS}).status_code == 401


def test_rejects_missing_timestamp():
    assert send("POST", BODY, {"X-GS-SIGNATURE": sign(BODY, TS)}).status_code == 401


def test_rejects_empty_signature():
    assert send("POST", BODY, {"X-GS-TIMESTAMP": TS, "X-GS-SIGNATURE": ""}).status_code == 401


def test_rejects_tampered_body():
    assert send("POST", b'{"eventName":"employee.added"}', signed(BODY)).status_code == 401


def test_rejects_different_timestamp():
    h = {**signed(BODY), "X-GS-TIMESTAMP": "2026-10-26T12:00:01Z"}
    assert send("POST", BODY, h).status_code == 401


def test_rejects_literal_backslash_n_separator():
    bad = hmac.new(SECRET.encode(), TS.encode() + b"\\n" + BODY, hashlib.sha256).hexdigest()
    assert send("POST", BODY, {"X-GS-TIMESTAMP": TS, "X-GS-SIGNATURE": bad}).status_code == 401


def test_rejects_wrong_secret():
    h = {"X-GS-TIMESTAMP": TS, "X-GS-SIGNATURE": sign(BODY, TS, "other")}
    assert send("POST", BODY, h).status_code == 401


@pytest.mark.parametrize(
    "sig",
    ["ab" * 31, "ab" * 33, "zz" * 32, "sha256=" + "ab" * 32, "ab" * 32 + "\n"],
    ids=["too-short", "too-long", "non-hex", "prefixed", "trailing-newline"],
)
def test_rejects_malformed_signature(sig):
    assert send("POST", BODY, {"X-GS-TIMESTAMP": TS, "X-GS-SIGNATURE": sig}).status_code == 401


class TestTolerance:
    old_ts = str(int(time.time()) - 3600)

    def test_off_by_default(self):
        assert send("POST", BODY, signed(BODY, self.old_ts)).status_code == 200

    def test_rejects_old_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("GREENSHADES_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send("POST", BODY, signed(BODY, self.old_ts)).status_code == 401

    def test_accepts_fresh_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("GREENSHADES_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send("POST", BODY, signed(BODY, str(int(time.time())))).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("GREENSHADES_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert send("POST", BODY, signed(BODY, self.old_ts)).status_code == 200


def test_invalid_json_after_valid_signature_is_400():
    body = b"not json"
    assert send("POST", body, signed(body)).status_code == 400


def test_missing_secret_is_500(monkeypatch):
    monkeypatch.delenv("GREENSHADES_WEBHOOK_SECRET")
    assert send("POST", BODY, signed(BODY)).status_code == 500
