"""Tests for the RocketReach webhook handler.

Signatures are generated the way RocketReach does:
base64(HMAC-SHA256(secret as UTF-8, raw body)).
"""

import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

TEST_SECRET = "rocketreach_test_secret"
os.environ["ROCKETREACH_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_rocketreach_signature  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = TEST_SECRET) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def profile(status: str = "complete", profile_id: int = 123456) -> dict:
    return {
        "profile_list": {"id": 1000, "name": "Example Profile List"},
        "id": profile_id,
        "status": status,
        "name": "Ada Lovelace",
        "current_title": "Engineer",
        "current_employer": "Analytical Engines",
        "emails": [{"email": "ada@example.com", "smtp_valid": "valid"}],
    }


def post(body: str, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/rocketreach",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestVerifySignature:
    BODY = json.dumps(profile())

    def test_accepts_correct_signature(self):
        assert verify_rocketreach_signature(self.BODY.encode(), sign(self.BODY), TEST_SECRET)

    def test_rejects_missing_values_and_length_mismatch(self):
        body = self.BODY.encode()
        assert not verify_rocketreach_signature(body, None, TEST_SECRET)
        assert not verify_rocketreach_signature(body, sign(self.BODY), None)
        assert not verify_rocketreach_signature(body, "short", TEST_SECRET)

    def test_rejects_hex_digest(self):
        hex_digest = hmac.new(TEST_SECRET.encode(), self.BODY.encode(), hashlib.sha256).hexdigest()
        assert not verify_rocketreach_signature(self.BODY.encode(), hex_digest, TEST_SECRET)

    def test_non_ascii_header_is_false_not_an_error(self):
        assert not verify_rocketreach_signature(self.BODY.encode(), "é" * 22, TEST_SECRET)


class TestWebhookEndpoint:
    def test_accepts_signed_people_lookup(self):
        body = json.dumps(profile())
        res = post(body, {"X-RocketReach-Signature": sign(body), "RR-Request-ID": "abc"})
        assert res.status_code == 200
        assert res.json() == {"received": True, "profiles": 1}

    def test_accepts_signed_bulk_lookup(self):
        body = json.dumps([profile("complete", 1), profile("complete", 2)])
        res = post(body, {"X-RocketReach-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True, "profiles": 2}

    @pytest.mark.parametrize("status", ["complete", "progress", "searching"])
    def test_accepts_any_lookup_status(self, status):
        body = json.dumps(profile(status))
        assert post(body, {"X-RocketReach-Signature": sign(body)}).status_code == 200

    def test_verifies_any_content_type(self):
        body = json.dumps(profile())
        res = post(body, {"X-RocketReach-Signature": sign(body)}, "text/plain")
        assert res.status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(profile())).status_code == 401

    def test_rejects_invalid_signature(self):
        res = post(json.dumps(profile()), {"X-RocketReach-Signature": sign("other")})
        assert res.status_code == 401

    def test_non_ascii_signature_header_gives_401(self):
        body = json.dumps(profile())
        res = post(body, {"X-RocketReach-Signature": "é".encode("utf-8")})
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(profile())
        res = post(body, {"X-RocketReach-Signature": sign(body, "wrong_secret")})
        assert res.status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(profile())
        res = post(body.replace("Ada", "Eve"), {"X-RocketReach-Signature": sign(body)})
        assert res.status_code == 401

    def test_rejects_signed_non_json(self):
        body = "not json"
        res = post(body, {"X-RocketReach-Signature": sign(body)}, "text/plain")
        assert res.status_code == 400

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("ROCKETREACH_WEBHOOK_SECRET")
        body = json.dumps(profile())
        res = post(body, {"X-RocketReach-Signature": sign(body)})
        assert res.status_code == 500
