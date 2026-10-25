import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Simpro secrets are any string you choose on the subscription
SECRET = "test_simpro_secret_long_random_value"
os.environ["SIMPRO_WEBHOOK_SECRET"] = SECRET

from main import app, verify_simpro_signature  # noqa: E402

client = TestClient(app)

JOB_CREATED = {
    "ID": "job.created",
    "build": "https://example.simprosuite.com",
    "description": "Job #42 has been created.",
    "name": "Job",
    "action": "created",
    "reference": {"companyID": 0, "jobID": 42},
    "date_triggered": "2019-06-28T16:35:12+10:00",
}

TEST_EVENT = {
    "ID": "test.updated",
    "build": "https://example.simprosuite.com",
    "description": "Test #1 has been updated.",
    "name": "Test",
    "action": "updated",
    "reference": {"testID": 1},
    "date_triggered": "2019-06-30T19:02:37-05:00",
}


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign like Simpro: lowercase hex HMAC-SHA1 of the raw body."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha1).hexdigest()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["X-Response-Signature"] = signature
    return client.post("/webhooks/simpro", content=body, headers=headers)


class TestVerifySimproSignature:
    body = json.dumps(JOB_CREATED).encode()

    def test_valid_signature(self):
        assert verify_simpro_signature(self.body, sign(self.body), SECRET)

    def test_digest_is_40_hex_chars(self):
        assert len(sign(self.body)) == 40

    def test_uppercase_hex(self):
        assert verify_simpro_signature(self.body, sign(self.body).upper(), SECRET)

    def test_tampered_body(self):
        assert not verify_simpro_signature(self.body + b" ", sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_simpro_signature(self.body, sign(self.body, "other"), SECRET)

    def test_sha256_signature(self):
        sha256 = hmac.new(SECRET.encode(), self.body, hashlib.sha256).hexdigest()
        assert not verify_simpro_signature(self.body, sha256, SECRET)

    def test_prefixed_signature(self):
        assert not verify_simpro_signature(self.body, "sha1=" + sign(self.body), SECRET)

    def test_non_hex_signature(self):
        assert not verify_simpro_signature(self.body, "zz" * 20, SECRET)

    def test_truncated_signature(self):
        assert not verify_simpro_signature(self.body, sign(self.body)[:20], SECRET)

    def test_missing_signature_or_secret(self):
        assert not verify_simpro_signature(self.body, None, SECRET)
        assert not verify_simpro_signature(self.body, sign(self.body), None)


class TestWebhookEndpoint:
    def test_signed_job_created(self):
        body = json.dumps(JOB_CREATED).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_test_subscription_event(self):
        body = json.dumps(TEST_EVENT).encode()
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(JOB_CREATED).encode()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_unknown_event_id(self):
        body = json.dumps({**JOB_CREATED, "ID": "something.else"}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_missing_signature(self):
        assert post(json.dumps(JOB_CREATED).encode()).status_code == 401

    def test_invalid_signature(self):
        assert post(json.dumps(JOB_CREATED).encode(), "a" * 40).status_code == 401

    def test_body_altered_after_signing(self):
        signature = sign(json.dumps(JOB_CREATED).encode())
        altered = json.dumps({**JOB_CREATED, "ID": "job.deleted"}).encode()
        assert post(altered, signature).status_code == 401

    def test_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_signed_non_object(self):
        body = b"[1, 2]"
        assert post(body, sign(body)).status_code == 400
