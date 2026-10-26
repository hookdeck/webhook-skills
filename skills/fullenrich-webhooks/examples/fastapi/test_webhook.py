import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# FullEnrich signs with your API key (no separate webhook secret)
API_KEY = "test_fullenrich_api_key"
os.environ["FULLENRICH_API_KEY"] = API_KEY

from main import app, verify_fullenrich_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, key: str = API_KEY) -> str:
    """Sign like FullEnrich: lowercase hex(HMAC-SHA1(api_key, raw_body))."""
    return hmac.new(key.encode(), body, hashlib.sha1).hexdigest()


BATCH = json.dumps({
    "id": "enr_123",
    "name": "My Enrichment",
    "status": "FINISHED",
    "cost": {"credits": 10},
    "data": [{"custom": {"user_id": "12584"}, "contact_info": {}}],
}).encode()

CONTACT = json.dumps({
    "id": "enr_123",
    "status": "IN_PROGRESS",
    "data": [{"custom": {}, "contact_info": {}}],
}).encode()


def post(body: bytes, headers=None):
    return client.post(
        "/webhooks/fullenrich",
        content=body,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerify:
    def test_valid(self):
        assert verify_fullenrich_signature(BATCH, sign(BATCH), API_KEY)

    def test_uppercase_hex(self):
        assert verify_fullenrich_signature(BATCH, sign(BATCH).upper(), API_KEY)

    def test_wrong_key_or_body(self):
        assert not verify_fullenrich_signature(BATCH, sign(BATCH, "other"), API_KEY)
        assert not verify_fullenrich_signature(BATCH + b" ", sign(BATCH), API_KEY)

    @pytest.mark.parametrize("bad", ["z" * 40, "ab" * 10, "é" * 40, "", None])
    def test_malformed(self, bad):
        assert not verify_fullenrich_signature(BATCH, bad, API_KEY)

    def test_rejects_sha256(self):
        sha256 = hmac.new(API_KEY.encode(), BATCH, hashlib.sha256).hexdigest()
        assert not verify_fullenrich_signature(BATCH, sha256, API_KEY)


class TestWebhook:
    def test_batch_result(self):
        res = post(BATCH, {"X-Signature-SHA1": sign(BATCH)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_contact_finished(self):
        assert post(CONTACT, {"X-Signature-SHA1": sign(CONTACT)}).status_code == 200

    def test_any_content_type(self):
        res = post(BATCH, {"Content-Type": "text/plain", "X-Signature-SHA1": sign(BATCH)})
        assert res.status_code == 200

    def test_missing_header(self):
        assert post(BATCH).status_code == 400

    def test_invalid_signature(self):
        assert post(BATCH, {"X-Signature-SHA1": sign(BATCH, "wrong")}).status_code == 401

    def test_non_ascii_signature_is_401(self):
        res = client.post(
            "/webhooks/fullenrich",
            content=BATCH,
            headers={
                "Content-Type": "application/json",
                "X-Signature-SHA1": ("é" * 40).encode("utf-8"),
            },
        )
        assert res.status_code == 401

    def test_invalid_json(self):
        bad = b"{not json"
        assert post(bad, {"X-Signature-SHA1": sign(bad)}).status_code == 400
