import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_bump_secret_token"
os.environ["BUMP_SH_WEBHOOK_SECRET"] = SECRET

from main import app, verify_bump_signature  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("BUMP_SH_WEBHOOK_SECRET", SECRET)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Generate a real Bump.sh signature: hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sample_payload() -> bytes:
    return json.dumps(
        {
            "api": {"id": "doc_123", "name": "Payments API"},
            "diff": {
                "id": "diff_456",
                "breaking": False,
                "structure": [{"id": "POST /charges", "status": "added"}],
            },
        }
    ).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Bump-Signature-256"] = signature
    return client.post("/webhooks/bump-sh", content=body, headers=headers)


class TestBumpShWebhook:
    def test_accepts_valid_prefixed_signature(self):
        body = sample_payload()
        assert post(body, f"sha256={sign(body)}").status_code == 200

    def test_accepts_bare_hex_signature(self):
        body = sample_payload()
        assert post(body, sign(body)).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = sample_payload()
        assert post(body, f"sha256={sign(body).upper()}").status_code == 200

    def test_verifies_exact_bytes_for_any_content_type(self):
        # Odd spacing and key order must be preserved: the signature covers raw bytes.
        body = b'{ "diff" : {"a":1},\n  "api":{"b":2} }'
        res = post(body, f"sha256={sign(body)}", content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_tampered_body(self):
        body = sample_payload()
        assert post(body + b" ", f"sha256={sign(body)}").status_code == 401

    def test_rejects_wrong_secret(self):
        body = sample_payload()
        assert post(body, f"sha256={sign(body, 'other_secret')}").status_code == 401

    def test_rejects_missing_signature(self):
        assert post(sample_payload()).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(sample_payload(), "").status_code == 401

    def test_rejects_malformed_signatures(self):
        body = sample_payload()
        good = sign(body)
        for value in [
            "sha256=",
            "sha256=abc123",
            f"sha256={good}00",
            f"sha256={good[:62]}zz",
            f"sha1={good}",
            f"sha256=sha256={good}",
            "not-a-signature",
        ]:
            assert post(body, value).status_code == 401, value

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("BUMP_SH_WEBHOOK_SECRET")
        body = sample_payload()
        assert post(body, f"sha256={sign(body)}").status_code == 500

    def test_returns_400_for_signed_non_json_body(self):
        body = b"not json"
        assert post(body, f"sha256={sign(body)}").status_code == 400

    def test_returns_400_for_signed_invalid_utf8_body(self):
        body = b"\xff\xfe\x00{}"
        assert post(body, f"sha256={sign(body)}").status_code == 400

    @pytest.mark.parametrize("raw", [b"[]", b"null", b'"text"', b"42"])
    def test_returns_400_for_signed_non_object_json(self, raw):
        assert post(raw, f"sha256={sign(raw)}").status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"api": "x", "diff": 1},
            {"api": None, "diff": []},
            {"api": [1], "diff": "y"},
            {},
        ],
    )
    def test_ignores_wrong_typed_fields(self, payload):
        body = json.dumps(payload).encode()
        assert post(body, f"sha256={sign(body)}").status_code == 200

    def test_get_is_not_allowed(self):
        assert client.get("/webhooks/bump-sh").status_code == 405


class TestVerifyBumpSignature:
    def test_false_when_header_or_secret_missing(self):
        body = b"{}"
        assert verify_bump_signature(body, None, SECRET) is False
        assert verify_bump_signature(body, f"sha256={sign(body)}", "") is False

    def test_binary_body(self):
        body = bytes([0xFF, 0xFE, 0x00, 0x7B, 0x7D])
        assert verify_bump_signature(body, f"sha256={sign(body)}", SECRET) is True
