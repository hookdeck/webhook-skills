import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

import main
from main import app, verify_texture_signature

# Texture secrets are plain strings. This one looks like a Standard Webhooks key but is used whole.
SECRET = "whsec_my-webhook-secret"

client = TestClient(app)


def sign(body, secret=SECRET) -> str:
    """Sign exactly as Texture does: lowercase hex HMAC-SHA256 of the raw body, secret as UTF-8."""
    if isinstance(body, str):
        body = body.encode()
    key = secret.encode() if isinstance(secret, str) else secret
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def event(type_, **extra):
    return {
        "type": type_,
        "deviceId": "dev_123",
        "organizationId": "org_123",
        "workspaceId": "ws_123",
        "key": "evt_abc123",
        **extra,
    }


def post(body, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    return client.post("/webhooks/texture", content=body, headers=all_headers)


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("TEXTURE_WEBHOOK_SECRET", SECRET)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = json.dumps(event("device.updated"))
        res = post(body, {"Texture-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_exact_bytes_received(self):
        body = '{ "type" : "device.updated",\n  "deviceId":"dev_123" }'
        res = post(body, {"Texture-Signature": sign(body)})
        assert res.status_code == 200

    def test_accepts_uppercase_hex(self):
        body = json.dumps(event("device.updated"))
        res = post(body, {"Texture-Signature": sign(body).upper()})
        assert res.status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(event("device.updated"))
        res = post(body, {"Content-Type": "text/plain", "Texture-Signature": sign(body)})
        assert res.status_code == 200

    def test_uses_whole_secret_including_whsec_prefix(self):
        body = json.dumps(event("device.updated"))
        res = post(body, {"Texture-Signature": sign(body, "my-webhook-secret")})
        assert res.status_code == 401

    def test_does_not_base64_decode_secret(self):
        body = json.dumps(event("device.updated"))
        wrong = sign(body, base64.urlsafe_b64decode("my-webhook-secre"))
        res = post(body, {"Texture-Signature": wrong})
        assert res.status_code == 401

    def test_rejects_other_secret(self):
        body = json.dumps(event("device.updated"))
        res = post(body, {"Texture-Signature": sign(body, "whsec_other")})
        assert res.status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(event("device.updated"))
        res = post(body.replace("dev_123", "dev_999"), {"Texture-Signature": sign(body)})
        assert res.status_code == 401

    def test_rejects_missing_header(self):
        assert post(json.dumps(event("device.updated"))).status_code == 401

    def test_rejects_empty_header(self):
        res = post(json.dumps(event("device.updated")), {"Texture-Signature": ""})
        assert res.status_code == 401

    @pytest.mark.parametrize(
        "value",
        ["abc123", "a" * 66, "z" * 64, "sha256=" + "a" * 64, "a" * 64 + "zz", "a" * 64 + "\n"],
    )
    def test_rejects_malformed_signature(self, value):
        res = post(json.dumps(event("device.updated")), {"Texture-Signature": value})
        assert res.status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        # A non-ASCII value would make compare_digest raise TypeError on str; it must be a clean 401.
        res = post(json.dumps(event("device.updated")), {"Texture-Signature": ("é" * 64).encode("latin-1")})
        assert res.status_code == 401

    def test_does_not_check_texture_timestamp(self):
        body = json.dumps(event("device.updated"))
        res = post(
            body,
            {"Texture-Signature": sign(body), "Texture-Timestamp": "2001-01-01T00:00:00.000Z"},
        )
        assert res.status_code == 200

    def test_rejects_everything_without_configured_secret(self, monkeypatch):
        monkeypatch.delenv("TEXTURE_WEBHOOK_SECRET", raising=False)
        body = json.dumps(event("device.updated"))
        assert post(body, {"Texture-Signature": sign(body)}).status_code == 401

    def test_verify_function_on_bytes(self):
        raw = b'{"a":1}'
        assert verify_texture_signature(raw, sign(raw), SECRET) is True
        assert verify_texture_signature(raw, sign(raw), "nope") is False
        assert verify_texture_signature(raw, None, SECRET) is False


class TestRequestBody:
    def test_400_for_signed_non_json(self):
        body = "not json"
        assert post(body, {"Texture-Signature": sign(body)}).status_code == 400

    def test_400_for_signed_non_object(self):
        body = "[1,2,3]"
        assert post(body, {"Texture-Signature": sign(body)}).status_code == 400


class TestEventHandling:
    @pytest.mark.parametrize(
        "type_",
        [
            "device.discovered",
            "device.updated",
            "device.disconnected",
            "command.succeeded",
            "command.failed",
            "command.overridden",
            "customer.created",
            "enrollment.approved",
            "site.created",
        ],
    )
    def test_handles_event(self, type_, capsys):
        body = json.dumps(event(type_))
        res = post(body, {"Texture-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self, capsys):
        body = json.dumps(event("device.created"))
        res = post(body, {"Texture-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled Texture event type" in capsys.readouterr().out


def test_health():
    assert client.get("/health").status_code == 200
