# Generated with: semaphore-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Semaphore CI webhook receiver.

Signed exactly as Semaphore signs: lowercase hex HMAC-SHA256 of the raw body, no prefix.
"""

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_semaphore_signature

SECRET = "semaphore-test-secret"
URL = "/webhooks/semaphore"
SIG = "x-semaphore-signature-256"

client = TestClient(app)


def sign(body, secret=SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def pipeline_done(result="passed"):
    # Trimmed from the payload in Semaphore's notification docs.
    return {
        "version": "1.0.0",
        "organization": {"name": "semaphore", "id": "36360e31-fee6-42b2-9f6c-999d4c06ce81"},
        "project": {"name": "notifications", "id": "91e34570-bebe-42b6-b47a-ca710b2b8927"},
        "repository": {"url": "https://github.com/semaphoreci/myproject", "slug": "semaphoreci/notifications"},
        "revision": {"reference": "refs/heads/rw/webhook_impl", "commit_sha": "2d9f5fcec1ca7c68fa7bd44dd58ec4ff65814563"},
        "workflow": {"id": "acabe58e-4bcc-4d39-be06-e98d71917703"},
        "pipeline": {"id": "fa02c7bd-7a8b-42e0-8d6e-aa0d8a194e19", "name": "Notificaitons", "state": "done", "result": result},
        "blocks": [{"name": "Lint", "result": result, "jobs": [{"name": "Lint", "status": "finished", "result": result}]}],
    }


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("SEMAPHORE_WEBHOOK_SECRET", SECRET)


def post(body: str, headers=None):
    return client.post(URL, content=body, headers={"content-type": "application/json", **(headers or {})})


class TestVerifySemaphoreSignature:
    body = b'{"a":1}'

    def test_accepts_valid_hex_in_either_case(self):
        assert verify_semaphore_signature(self.body, sign(self.body), SECRET)
        assert verify_semaphore_signature(self.body, sign(self.body).upper(), SECRET)

    def test_rejects_wrong_secret_tampered_body_missing(self):
        assert not verify_semaphore_signature(self.body, sign(self.body, "other"), SECRET)
        assert not verify_semaphore_signature(b'{"a":2}', sign(self.body), SECRET)
        assert not verify_semaphore_signature(self.body, None, SECRET)
        assert not verify_semaphore_signature(self.body, "", SECRET)

    def test_rejects_malformed_values(self):
        good = sign(self.body)
        assert not verify_semaphore_signature(self.body, f"sha256={good}", SECRET)
        assert not verify_semaphore_signature(self.body, good[:63], SECRET)
        assert not verify_semaphore_signature(self.body, good + "a", SECRET)
        assert not verify_semaphore_signature(self.body, "z" * 64, SECRET)

    def test_rejects_when_no_secret(self):
        assert not verify_semaphore_signature(self.body, sign(self.body, ""), "")


class TestWebhook:
    @pytest.mark.parametrize("result", ["passed", "failed", "stopped", "canceled"])
    def test_accepts_signed_pipeline(self, result):
        body = json.dumps(pipeline_done(result))
        res = post(body, {SIG: sign(body), "x-semaphore-webhook-id": "b1f2c3d4"})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_unknown_result_and_any_content_type(self):
        body = json.dumps(pipeline_done("something-new"))
        res = client.post(URL, content=body, headers={"content-type": "text/plain", SIG: sign(body)})
        assert res.status_code == 200

    def test_verifies_exact_bytes_not_reserialized_body(self):
        body = json.dumps(pipeline_done(), indent=2)
        assert post(body, {SIG: sign(body)}).status_code == 200
        reserialized = sign(json.dumps(json.loads(body)))
        assert post(body, {SIG: reserialized}).status_code == 401

    def test_rejects_missing_wrong_malformed_or_prefixed_signature(self):
        body = json.dumps(pipeline_done())
        assert post(body).status_code == 401
        assert post(body, {SIG: sign(body, "wrong")}).status_code == 401
        assert post(body, {SIG: "abc"}).status_code == 401
        assert post(body, {SIG: f"sha256={sign(body)}"}).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(pipeline_done("passed"))
        assert post(body.replace("passed", "failed"), {SIG: sign(body)}).status_code == 401

    @pytest.mark.parametrize("body", ["not json", "[1, 2]"])
    def test_400_for_signed_body_that_is_not_a_json_object(self, body):
        assert post(body, {SIG: sign(body)}).status_code == 400

    def test_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("SEMAPHORE_WEBHOOK_SECRET")
        body = json.dumps(pipeline_done())
        assert post(body, {SIG: sign(body)}).status_code == 500


class TestOtherMethods:
    @pytest.mark.parametrize("method", ["PUT", "PATCH"])
    def test_signed_with_body(self, method):
        body = json.dumps(pipeline_done())
        res = client.request(method, URL, content=body, headers={SIG: sign(body)})
        assert res.status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_empty_body_verified_over_zero_bytes(self, method):
        assert client.request(method, URL, headers={SIG: sign(b"")}).status_code == 200

    def test_unsigned_get_is_401(self):
        assert client.get(URL).status_code == 401
