import hashlib
import hmac
import os

import pytest
from fastapi.testclient import TestClient

# SendX signs with the team API key (any string, used as UTF-8 bytes as-is)
SECRET = "sendx_team_api_key_for_tests"
os.environ["SENDX_WEBHOOK_SECRET"] = SECRET

from main import app, get_event_type, verify_sendx_signature  # noqa: E402

client = TestClient(app)
BODY = b'{"type": 7, "email": "jane@example.com"}'


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/sendx", content=body, headers={"content-type": content_type, **(headers or {})}
    )


def test_accepts_valid_signature(capsys):
    res = post(BODY, {"X-SendX-Signature": sign(BODY), "X-SendX-Signature-Alg": "hmac-sha256"})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "MailOpen (type 7)" in capsys.readouterr().out


def test_accepts_uppercase_hex_signature():
    assert post(BODY, {"X-SendX-Signature": sign(BODY).upper()}).status_code == 200


def test_verifies_any_content_type_over_raw_bytes():
    assert post(BODY, {"X-SendX-Signature": sign(BODY)}, content_type="text/plain").status_code == 200


def test_verifies_exact_bytes_with_odd_whitespace():
    spaced = b'{ "type" : 8 ,\n "email":"a@example.com" }'
    assert post(spaced, {"X-SendX-Signature": sign(spaced)}).status_code == 200


def test_rejects_missing_signature():
    assert post(BODY).status_code == 401


def test_rejects_empty_signature():
    assert post(BODY, {"X-SendX-Signature": ""}).status_code == 401


def test_rejects_wrong_secret():
    assert post(BODY, {"X-SendX-Signature": sign(BODY, "other_key")}).status_code == 401


def test_rejects_tampered_body():
    assert post(BODY.replace(b"jane", b"mallory"), {"X-SendX-Signature": sign(BODY)}).status_code == 401


@pytest.mark.parametrize(
    "sig",
    ["abcd", "a" * 66, "z" * 64, "sha256=" + "a" * 64, "a" * 64 + "\n"],
    ids=["too-short", "too-long", "non-hex", "prefixed", "trailing-newline"],
)
def test_rejects_malformed_signature(sig):
    assert post(BODY, {"X-SendX-Signature": sig}).status_code == 401


def test_non_ascii_signature_is_rejected_not_500():
    # httpx cannot send non-ASCII headers, so exercise the verifier directly
    assert verify_sendx_signature(BODY, "é" * 64, SECRET) is False


def test_signed_non_json_body_is_400():
    bad = b"not json"
    assert post(bad, {"X-SendX-Signature": sign(bad)}).status_code == 400


def test_signed_invalid_utf8_body_is_400():
    bad = b"\xff\xfe"
    assert post(bad, {"X-SendX-Signature": sign(bad)}).status_code == 400


@pytest.mark.parametrize("raw", [b"null", b"42", b"[1,2]", b'"text"'])
def test_signed_non_object_body_is_400(raw):
    assert post(raw, {"X-SendX-Signature": sign(raw)}).status_code == 400


@pytest.mark.parametrize(
    "raw",
    [b'{"email": "a@example.com"}', b'{"type": "open"}', b'{"type": {"a": 1}}', b'{"type": null}', b'{"type": 7.5}', b'{"type": true}'],
)
def test_wrong_typed_event_is_ignored_not_500(raw):
    assert post(raw, {"X-SendX-Signature": sign(raw)}).status_code == 200


def test_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("SENDX_WEBHOOK_SECRET")
    assert post(BODY, {"X-SendX-Signature": sign(BODY)}).status_code == 500


def test_event_codes_compare_as_numbers():
    assert get_event_type({"type": 7}) == 7
    assert get_event_type({"type": "8"}) == 8
    assert get_event_type({"type": "x"}) is None
    assert get_event_type({"type": True}) is None
    assert get_event_type([7]) is None
