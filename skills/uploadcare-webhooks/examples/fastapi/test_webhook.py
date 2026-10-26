import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_signing_secret"
os.environ["UPLOADCARE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_uploadcare_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def payload(event: str) -> bytes:
    return json.dumps(
        {
            "hook": {"id": 1, "event": event, "project_pub_key": "pub"},
            "data": {"uuid": "3f2c1a5e-0000-4000-8000-000000000000", "size": 10},
            "file": "https://ucarecdn.com/3f2c1a5e-0000-4000-8000-000000000000/",
        }
    ).encode()


def post(body: bytes, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/uploadcare",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


@pytest.mark.parametrize(
    "event", ["file.uploaded", "file.info_updated", "file.deleted", "file.stored", "file.infected"]
)
def test_accepts_signed_events(event, capsys):
    body = payload(event)
    res = post(body, {"X-Uc-Signature": f"v1={sign(body)}"})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Unhandled" not in capsys.readouterr().out


def test_logs_unknown_events(capsys):
    body = payload("file.something_new")
    res = post(body, {"X-Uc-Signature": f"v1={sign(body)}"})
    assert res.status_code == 200
    assert "Unhandled event: file.something_new" in capsys.readouterr().out


def test_accepts_bare_digest():
    body = payload("file.uploaded")
    assert post(body, {"X-Uc-Signature": sign(body)}).status_code == 200


def test_accepts_uppercase_hex():
    body = payload("file.uploaded")
    assert post(body, {"X-Uc-Signature": f"v1={sign(body).upper()}"}).status_code == 200


def test_verifies_exact_bytes_any_content_type():
    body = b'{"hook":{"event":"file.uploaded"},   "data":{}}'
    res = post(body, {"X-Uc-Signature": f"v1={sign(body)}"}, content_type="text/plain")
    assert res.status_code == 200


def test_rejects_missing_header():
    assert post(payload("file.uploaded")).status_code == 401


def test_rejects_empty_header():
    assert post(payload("file.uploaded"), {"X-Uc-Signature": ""}).status_code == 401


def test_rejects_wrong_secret():
    body = payload("file.uploaded")
    assert post(body, {"X-Uc-Signature": f"v1={sign(body, 'other')}"}).status_code == 401


def test_rejects_tampered_body():
    body = payload("file.uploaded")
    tampered = body.replace(b'"size": 10', b'"size": 11')
    assert tampered != body
    assert post(tampered, {"X-Uc-Signature": f"v1={sign(body)}"}).status_code == 401


@pytest.mark.parametrize(
    "value",
    ["v1=abc123", "v1=" + "z" * 64, "v1=" + sign(b"x") + "zz", "v2=" + sign(b"x")],
)
def test_rejects_malformed_signature(value):
    assert post(payload("file.uploaded"), {"X-Uc-Signature": value}).status_code == 401


def test_rejects_non_ascii_header_without_500():
    res = client.post(
        "/webhooks/uploadcare",
        content=payload("file.uploaded"),
        headers={"X-Uc-Signature": "v1=é".encode("latin-1")},
    )
    assert res.status_code == 401


def test_invalid_json_with_valid_signature_is_400():
    body = b"not json"
    assert post(body, {"X-Uc-Signature": f"v1={sign(body)}"}).status_code == 400


def test_json_array_with_valid_signature_is_400():
    body = b"[1,2]"
    assert post(body, {"X-Uc-Signature": f"v1={sign(body)}"}).status_code == 400


def test_no_secret_rejects_everything():
    body = b"{}"
    assert verify_uploadcare_signature(body, f"v1={sign(body)}", "") is False


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
