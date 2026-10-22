import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "loop_test_secret_key"
os.environ["LOOP_WEBHOOK_SECRET"] = SECRET

from main import app, verify_loop_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Loop signs the raw body: base64(HMAC-SHA256(secret, body))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def post(payload, signature=None, secret=SECRET, content_type="application/json", send_signature=True):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    headers = {"content-type": content_type}
    if send_signature:
        headers["x-loop-signature"] = signature if signature is not None else sign(body, secret)
    return client.post("/webhooks/loop-returns", content=body, headers=headers)


class TestVerifyLoopSignature:
    body = b'{"a":1}'

    def test_accepts_valid_signature(self):
        assert verify_loop_signature(self.body, sign(self.body), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_loop_signature(self.body, sign(self.body, "other"), SECRET)

    def test_rejects_wrong_length_signature(self):
        assert not verify_loop_signature(self.body, "short", SECRET)

    def test_rejects_missing_signature_or_secret(self):
        assert not verify_loop_signature(self.body, None, SECRET)
        assert not verify_loop_signature(self.body, sign(self.body), None)


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "trigger",
        [
            "return.created",
            "return.updated",
            "return.closed",
            "return.processing.failed",
            "label.created",
            "label.updated",
            "restock.requested",
            "giftcard.requested",
            "shipment.processed",
        ],
    )
    def test_accepts_trigger(self, trigger):
        res = post({"topic": trigger.split(".")[0], "trigger": trigger, "id": "1673"})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_unknown_trigger(self):
        assert post({"topic": "return", "trigger": "return.something_new"}).status_code == 200

    def test_verifies_any_content_type(self):
        res = post({"topic": "return", "trigger": "return.created"}, content_type="text/plain")
        assert res.status_code == 200

    def test_verifies_exact_bytes_including_escaped_slashes(self):
        body = b'{"topic":"return","trigger":"return.created","note":"a\\/b"}'
        assert post(body).status_code == 200

    def test_rejects_invalid_signature(self):
        assert post({"trigger": "return.created"}, signature="bogus").status_code == 400

    def test_rejects_wrong_secret(self):
        assert post({"trigger": "return.created"}, secret="wrong").status_code == 400

    def test_rejects_tampered_body(self):
        original = json.dumps({"trigger": "return.created"}).encode()
        res = post({"trigger": "return.closed"}, signature=sign(original))
        assert res.status_code == 400

    def test_rejects_missing_signature_header(self):
        assert post({"trigger": "return.created"}, send_signature=False).status_code == 400

    def test_rejects_signed_non_json_body(self):
        assert post(b"not json").status_code == 400

    def test_rejects_signed_non_object_json(self):
        assert post(b"[1,2]").status_code == 400
