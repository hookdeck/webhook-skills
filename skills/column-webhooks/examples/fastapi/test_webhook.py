import base64
import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# The signing secret is used as-is (UTF-8 bytes, not decoded); this one is only for tests
SECRET = "test_column_signing_secret_7c1d"
os.environ["COLUMN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, secret=SECRET) -> str:
    # Column-Signature: lowercase hex HMAC-SHA256 of the raw body, no prefix
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Column-Signature"] = signature
    return client.post("/webhooks/column", content=body, headers=headers)


COMPLETED = json.dumps({
    "id": "evnt_2abc",
    "type": "ach.outgoing_transfer.completed",
    "created_at": "2026-10-26T12:00:00Z",
    "data": {"id": "acht_1xyz", "amount": 1000, "currency_code": "USD"},
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(COMPLETED, sign(COMPLETED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(COMPLETED, sign(COMPLETED), "text/plain").status_code == 200

    def test_verifies_exact_bytes(self):
        pretty = json.dumps(json.loads(COMPLETED), indent=2)
        assert post(pretty, sign(pretty)).status_code == 200
        assert post(pretty, sign(COMPLETED)).status_code == 401

    def test_accepts_uppercase_hex(self):
        assert post(COMPLETED, sign(COMPLETED).upper()).status_code == 200

    def test_rejects_missing_header(self):
        assert post(COMPLETED).status_code == 401

    def test_rejects_empty_header(self):
        assert post(COMPLETED, "").status_code == 401

    def test_rejects_tampered_body(self):
        assert post(COMPLETED.replace("1000", "9999"), sign(COMPLETED)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(COMPLETED, sign(COMPLETED, "other_secret")).status_code == 401

    def test_rejects_malformed_values(self):
        assert post(COMPLETED, "abc").status_code == 401
        assert post(COMPLETED, "zz" * 32).status_code == 401
        assert post(COMPLETED, sign(COMPLETED) + "aa").status_code == 401

    def test_rejects_non_ascii_header_without_500(self):
        # httpx only encodes ASCII str headers, so send the raw UTF-8 bytes
        header = ("é" + "a" * 63).encode("utf-8")
        assert post(COMPLETED, header).status_code == 401

    def test_rejects_prefixed_or_base64_signature(self):
        assert post(COMPLETED, f"sha256={sign(COMPLETED)}").status_code == 401
        digest = hmac.new(SECRET.encode(), COMPLETED.encode(), hashlib.sha256).digest()
        assert post(COMPLETED, base64.b64encode(digest).decode()).status_code == 401

    def test_accepts_old_event(self):
        # No timestamp is signed, so there is no replay window
        old = json.dumps({**json.loads(COMPLETED), "created_at": "2020-01-01T00:00:00Z"})
        assert post(old, sign(old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event_type", [
        "ach.outgoing_transfer.completed",
        "ach.outgoing_transfer.returned",
        "book.transfer.completed",
    ])
    def test_dispatch(self, caplog, event_type):
        body = json.dumps({"id": "evnt_1", "type": event_type, "data": {"id": "obj_1"}})
        with caplog.at_level(logging.INFO, logger="column-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_type(self, caplog):
        body = json.dumps({"id": "evnt_1", "type": "book.transfer.hold_created"})
        with caplog.at_level(logging.INFO, logger="column-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: book.transfer.hold_created" in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400
