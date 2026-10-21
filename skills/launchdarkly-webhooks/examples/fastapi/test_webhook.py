import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

SECRET = "test_launchdarkly_secret"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("LAUNCHDARKLY_WEBHOOK_SECRET", SECRET)


from main import app, verify_launchdarkly_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    # LaunchDarkly: HMAC-SHA256 hex digest of the raw body
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def entry(kind: str) -> bytes:
    return json.dumps({
        "_id": "57c0a8e29969090743529965",
        "date": 1472243938774,
        "accesses": [{"action": "updateOn", "resource": "proj/alexis:env/test"}],
        "kind": kind,
        "name": "Testing",
        "titleVerb": "changed the name of",
    }).encode()


def post(body: bytes, signature: str = None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-LD-Signature"] = signature
    return client.post("/webhooks/launchdarkly", content=body, headers=headers)


class TestVerify:
    def test_valid(self):
        body = entry("flag")
        assert verify_launchdarkly_webhook(body, sign(body), SECRET)

    def test_invalid(self):
        body = entry("flag")
        assert not verify_launchdarkly_webhook(body, sign(body, "other"), SECRET)
        assert not verify_launchdarkly_webhook(body, "", SECRET)
        assert not verify_launchdarkly_webhook(body, "abc", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("kind", ["flag", "segment", "project", "environment", "member"])
    def test_signed_events(self, kind):
        body = entry(kind)
        assert post(body, sign(body)).status_code == 200

    def test_invalid_signature(self):
        body = entry("flag")
        assert post(body, sign(body, "wrong")).status_code == 400

    def test_unsigned(self):
        assert post(entry("flag")).status_code == 400

    def test_tampered_body(self):
        body = entry("flag")
        assert post(body.replace(b"Testing", b"Hacked"), sign(body)).status_code == 400

    def test_signed_invalid_json(self):
        assert post(b"not json", sign(b"not json")).status_code == 400
