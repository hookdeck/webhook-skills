import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_sonarqube_secret"
os.environ["SONARQUBE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_sonarqube_signature  # noqa: E402

client = TestClient(app)
HEADER = "X-Sonar-Webhook-HMAC-SHA256"


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign like SonarQube: bare lowercase hex(HMAC-SHA256(secret, raw_body))."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


FAILED = json.dumps({
    "taskId": "AVh21JS2JepAEhwQ-b3u",
    "status": "SUCCESS",
    "analysedAt": "2026-10-26T09:30:00+0000",
    "project": {"key": "my_project", "name": "My Project"},
    "qualityGate": {"name": "Sonar way", "status": "ERROR", "conditions": []},
    "properties": {},
}).encode()

PASSED = json.dumps({
    "taskId": "AVh21JS2JepAEhwQ-b3v",
    "status": "SUCCESS",
    "project": {"key": "my_project"},
    "qualityGate": {"name": "Sonar way", "status": "OK", "conditions": []},
}).encode()


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("SONARQUBE_WEBHOOK_SECRET", SECRET)


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers[HEADER] = signature
    return client.post("/webhooks/sonarqube", content=body, headers=headers)


class TestVerifySignature:
    def test_accepts_valid(self):
        assert verify_sonarqube_signature(FAILED, sign(FAILED), SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_sonarqube_signature(FAILED, sign(FAILED).upper(), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_sonarqube_signature(FAILED, sign(FAILED, "other"), SECRET)

    def test_rejects_modified_body(self):
        assert not verify_sonarqube_signature(FAILED + b" ", sign(FAILED), SECRET)

    @pytest.mark.parametrize("bad", ["", None, "z" * 64, "ab" * 31, "ab" * 33, "é" * 64])
    def test_rejects_malformed(self, bad):
        assert not verify_sonarqube_signature(FAILED, bad, SECRET)

    def test_rejects_prefixed(self):
        assert not verify_sonarqube_signature(FAILED, "sha256=" + sign(FAILED), SECRET)

    def test_rejects_missing_secret(self):
        assert not verify_sonarqube_signature(FAILED, sign(FAILED), "")


class TestWebhookEndpoint:
    def test_accepts_failed_quality_gate(self):
        res = post(FAILED, sign(FAILED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_passed_quality_gate(self):
        assert post(PASSED, sign(PASSED)).status_code == 200

    def test_any_content_type(self):
        assert post(FAILED, sign(FAILED), "text/plain").status_code == 200

    def test_verifies_non_canonical_bytes(self):
        spaced = b'{ "taskId" : "t1",  "qualityGate": {"status":"OK"} }'
        assert post(spaced, sign(spaced)).status_code == 200

    def test_missing_header_401(self):
        assert post(FAILED).status_code == 401

    def test_empty_header_401(self):
        assert post(FAILED, "").status_code == 401

    def test_malformed_header_401(self):
        assert post(FAILED, "not-hex").status_code == 401

    def test_wrong_secret_401(self):
        assert post(FAILED, sign(FAILED, "other")).status_code == 401

    def test_invalid_json_400(self):
        assert post(b"not json", sign(b"not json")).status_code == 400

    def test_missing_secret_500(self, monkeypatch):
        monkeypatch.delenv("SONARQUBE_WEBHOOK_SECRET")
        assert post(FAILED, sign(FAILED)).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
