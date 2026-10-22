import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

TEST_SECRET = "test_seatable_secret"
os.environ["SEATABLE_WEBHOOK_SECRET"] = TEST_SECRET

from main import app, verify_seatable_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = TEST_SECRET) -> str:
    """Same algorithm as SeaTable: HMAC-SHA256 of the raw body, hex, 'sha256=' prefix."""
    return "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def make_payload(op_type: str, **extra) -> bytes:
    return json.dumps({
        "event": "update",
        "data": {
            "dtable_uuid": "fae0a3a42ba94df88e8303fd385e37de",
            "row_id": "Fk-i7xZGS5iA5aSvaG5HAA",
            "op_user": "4bc9a7c79c5942c5b6238413f2132bea@auth.local",
            "op_type": op_type,
            "op_time": 1649922777.279,
            "table_id": "9g8f",
            "table_name": "Opportunities",
            "row_name": "",
            "row_data": [],
            **extra,
        },
    }).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/seatable",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


class TestVerify:
    body = make_payload("insert_row")

    def test_valid_signature(self):
        assert verify_seatable_webhook(self.body, sign(self.body), TEST_SECRET)

    def test_wrong_secret(self):
        assert not verify_seatable_webhook(self.body, sign(self.body, "wrong"), TEST_SECRET)

    def test_tampered_body(self):
        assert not verify_seatable_webhook(make_payload("delete_row"), sign(self.body), TEST_SECRET)

    def test_missing_or_malformed_header(self):
        assert not verify_seatable_webhook(self.body, None, TEST_SECRET)
        assert not verify_seatable_webhook(self.body, "sha256=short", TEST_SECRET)

    def test_no_secret(self):
        assert not verify_seatable_webhook(self.body, sign(self.body, ""), "")


class TestWebhookEndpoint:
    @pytest.mark.parametrize("op_type", ["insert_row", "create_row", "modify_row", "delete_row"])
    def test_accepts_signed_events(self, op_type):
        body = make_payload(op_type)
        res = post(body, {"x-seatable-signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = make_payload("insert_row")
        res = post(body, {"content-type": "text/plain", "x-seatable-signature": sign(body)})
        assert res.status_code == 200

    def test_batched_change_with_row_count(self):
        body = make_payload("modify_row", row_count=5)
        res = post(body, {"x-seatable-signature": sign(body)})
        assert res.status_code == 200

    def test_invalid_signature(self):
        body = make_payload("insert_row")
        res = post(body, {"x-seatable-signature": "sha256=" + "a" * 64})
        assert res.status_code == 400

    def test_missing_signature(self):
        assert post(make_payload("insert_row")).status_code == 400

    def test_signed_body_not_json(self):
        body = b"not json"
        res = post(body, {"content-type": "text/plain", "x-seatable-signature": sign(body)})
        assert res.status_code == 400

    def test_unknown_op_type_is_acknowledged(self):
        body = make_payload("something_new")
        res = post(body, {"x-seatable-signature": sign(body)})
        assert res.status_code == 200

    def test_missing_secret_config(self, monkeypatch):
        monkeypatch.delenv("SEATABLE_WEBHOOK_SECRET")
        body = make_payload("insert_row")
        assert post(body, {"x-seatable-signature": sign(body)}).status_code == 500
