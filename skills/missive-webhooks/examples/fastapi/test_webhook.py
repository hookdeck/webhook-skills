import hashlib
import hmac
import json
import logging

import pytest
from fastapi.testclient import TestClient

SECRET = "test_missive_validation_secret"

from main import app  # noqa: E402

client = TestClient(app)

PAYLOAD = {
    "rule": {"id": "45408b30-aa3a-45n1-bh67-0a0cb8da9080", "description": "Notify elfs", "type": "label_change"},
    "conversation": {
        "id": "47a57b76-df42-4d8k-927x-80dbe5d87191",
        "subject": "Mordor GPS coordinates",
        "shared_labels": [{"id": "146ff5c4-d5la-3b63-b994-76711fn790lq", "name": "Elfs"}],
        "shared_label_names": "Elfs",
    },
    "latest_message": {
        "id": "86ef8bb8-269c-4959-a4f0-213db4e67844",
        "subject": "Fwd: Mordor GPS coordinates",
        "type": "email",
    },
}
BODY = json.dumps(PAYLOAD).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign exactly as Missive does: 'sha256=' + hex(HMAC-SHA256(secret, raw body))."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None):
    return client.post("/webhooks/missive", content=body, headers=headers or {})


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("MISSIVE_WEBHOOK_SECRET", SECRET)


JSON_HEADERS = {"content-type": "application/json"}


def test_accepts_valid_signature_and_handles_label_change(caplog):
    with caplog.at_level(logging.INFO, logger="missive-webhooks"):
        res = post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY)})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert 'Label change on "Mordor GPS coordinates"' in caplog.text


def test_accepts_uppercase_hex_after_prefix():
    header = "sha256=" + sign(BODY)[7:].upper()
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": header}).status_code == 200


def test_verifies_any_content_type():
    assert post(BODY, {"content-type": "text/plain", "x-hook-signature": sign(BODY)}).status_code == 200


def test_acknowledges_other_rule_types(caplog):
    other = json.dumps({**PAYLOAD, "rule": {**PAYLOAD["rule"], "type": "incoming_email"}}).encode()
    with caplog.at_level(logging.INFO, logger="missive-webhooks"):
        res = post(other, {**JSON_HEADERS, "x-hook-signature": sign(other)})
    assert res.status_code == 200
    assert "Unhandled Missive rule type: incoming_email" in caplog.text


def test_acknowledges_verified_body_without_rule():
    assert post(b"{}", {**JSON_HEADERS, "x-hook-signature": sign(b"{}")}).status_code == 200


def test_rejects_wrong_secret():
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY, "other")}).status_code == 401


def test_rejects_tampered_body():
    tampered = BODY.replace(b"Mordor", b"Gondor")
    assert post(tampered, {**JSON_HEADERS, "x-hook-signature": sign(BODY)}).status_code == 401


def test_rejects_missing_header():
    assert post(BODY, JSON_HEADERS).status_code == 401


def test_rejects_bare_hex_without_prefix():
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY)[7:]}).status_code == 401


def test_rejects_wrong_length():
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY)[:39]}).status_code == 401


def test_rejects_64_chars_that_are_not_hex():
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": "sha256=g" + sign(BODY)[8:]}).status_code == 401


def test_rejects_valid_signature_followed_by_junk():
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY) + "zz"}).status_code == 401


def test_non_ascii_header_returns_401_not_500():
    # Raw bytes: Starlette decodes them as latin-1, so the handler sees a non-ASCII str
    res = post(BODY, {**JSON_HEADERS, "x-hook-signature": b"sha256=" + "é".encode("latin-1") * 64})
    assert res.status_code == 401


def test_returns_400_for_invalid_json():
    bad = b"{not json"
    assert post(bad, {**JSON_HEADERS, "x-hook-signature": sign(bad)}).status_code == 400


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("MISSIVE_WEBHOOK_SECRET")
    assert post(BODY, {**JSON_HEADERS, "x-hook-signature": sign(BODY)}).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
