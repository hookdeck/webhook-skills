import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["BASIN_WEBHOOK_SECRET"] = "basin_test_signing_secret"

from main import app, verify_basin_signature  # noqa: E402

SECRET = os.environ["BASIN_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


JSON_BODY = json.dumps({"id": "sub_123", "email": "a@example.com", "name": "Ann"}).encode()
WRAPPED = json.dumps({"data": {"id": "sub_124", "email": "b@example.com"}}).encode()
FORM = b"id=sub_125&email=c%40example.com&name=Cy+Dee"


class TestVerify:
    def test_valid(self):
        assert verify_basin_signature(JSON_BODY, sign(JSON_BODY), SECRET)

    def test_invalid_variants(self):
        assert not verify_basin_signature(JSON_BODY, sign(JSON_BODY, "other"), SECRET)
        assert not verify_basin_signature(JSON_BODY, sign(JSON_BODY)[7:], SECRET)
        assert not verify_basin_signature(JSON_BODY, None, SECRET)
        assert not verify_basin_signature(JSON_BODY, "sha256=abcd", SECRET)
        assert not verify_basin_signature(JSON_BODY, "sha256=" + "é" * 64, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "body,ctype",
        [
            (JSON_BODY, "application/json"),
            (WRAPPED, "application/json"),
            (FORM, "application/x-www-form-urlencoded"),
            (JSON_BODY, "text/plain"),
        ],
    )
    def test_signed_submission(self, body, ctype):
        res = client.post(
            "/webhooks/basin",
            content=body,
            headers={"Content-Type": ctype, "X-Basin-Signature": sign(body)},
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unsigned_rejected(self):
        res = client.post("/webhooks/basin", content=JSON_BODY, headers={"Content-Type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature_rejected(self):
        res = client.post(
            "/webhooks/basin",
            content=JSON_BODY,
            headers={"Content-Type": "application/json", "X-Basin-Signature": sign(JSON_BODY, "wrong")},
        )
        assert res.status_code == 400

    def test_tampered_body_rejected(self):
        res = client.post(
            "/webhooks/basin",
            content=JSON_BODY.replace(b"Ann", b"Eve"),
            headers={"Content-Type": "application/json", "X-Basin-Signature": sign(JSON_BODY)},
        )
        assert res.status_code == 400

    def test_non_ascii_signature_header_is_400_not_500(self):
        res = client.post(
            "/webhooks/basin",
            content=JSON_BODY,
            headers={"Content-Type": "application/json", "X-Basin-Signature": "sha256=é".encode("latin-1")},
        )
        assert res.status_code == 400

    def test_malformed_signed_json(self):
        bad = b"{not json"
        res = client.post(
            "/webhooks/basin",
            content=bad,
            headers={"Content-Type": "application/json", "X-Basin-Signature": sign(bad)},
        )
        assert res.status_code == 400
