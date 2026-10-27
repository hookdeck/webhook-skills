import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
SECRET = "test_spacelift_secret_0123456789"
os.environ["SPACELIFT_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, classify, last_version, verify_spacelift_signature

client = TestClient(app)

# Payloads from Spacelift's documentation
RUN = {
    "account": "spacelift-io",
    "state": "FINISHED",
    "stateVersion": 4,
    "timestamp": 1596979684,
    "run": {
        "id": "01EF9PFPNFFM2MQXTJKHK1B869",
        "branch": "master",
        "commit": {"authorLogin": "marcinwyszynski", "hash": "0ee3a3b7266daf5a1d44a193a0f48ce995fa75eb", "message": "Update demo.tf"},
        "createdAt": 1596979665,
        "delta": {"added": 0, "changed": 0, "deleted": 0, "resources": 1},
        "triggeredBy": "marcinw@spacelift.io",
        "type": "TRACKED",
    },
    "stack": {"id": "spacelift-demo", "name": "Spacelift demo", "description": "", "labels": []},
}
ERROR = {
    "title": "Invalid Stack Slug Triggered",
    "body": "policy tried to trigger Stack 'this-is-not-a-stack' which either doesn't exist or this policy doesn't have access to",
    "error": "policy triggered for Stack that doesn't exist",
    "severity": "ERROR",
    "account": "spacelift-io",
}


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def send(method, body=None, headers=None):
    hdrs = dict(headers or {})
    if body is not None:
        hdrs.setdefault("Content-Type", "application/json")
    return client.request(method, "/webhooks/spacelift", content=body, headers=hdrs)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("SPACELIFT_WEBHOOK_SECRET", SECRET)
    last_version.clear()


class TestVerifySignature:
    body = json.dumps(RUN).encode()

    def test_accepts_prefixed_bare_and_uppercase(self):
        assert verify_spacelift_signature(self.body, f"sha256={sign(self.body)}", SECRET)
        assert verify_spacelift_signature(self.body, sign(self.body), SECRET)
        assert verify_spacelift_signature(self.body, sign(self.body).upper(), SECRET)

    def test_rejects_wrong_secret_tamper_and_no_secret(self):
        assert not verify_spacelift_signature(self.body, sign(self.body, "other"), SECRET)
        assert not verify_spacelift_signature(b"{}", sign(self.body), SECRET)
        assert not verify_spacelift_signature(self.body, sign(self.body), "")

    @pytest.mark.parametrize("header", [None, "", "sha256=abc", "z" * 64, "é" * 64])
    def test_rejects_missing_empty_and_malformed(self, header):
        assert not verify_spacelift_signature(self.body, header, SECRET)

    def test_rejects_extra_characters(self):
        assert not verify_spacelift_signature(self.body, sign(self.body) + "00", SECRET)


def test_classify():
    assert classify(RUN) == "run"
    assert classify(ERROR) == "internal_error"
    assert classify({"foo": 1}) == "unknown"
    assert classify(None) == "unknown"


class TestWebhookEndpoint:
    def test_run_message(self):
        body = json.dumps(RUN).encode()
        res = send("POST", body, {"X-Signature-256": f"sha256={sign(body)}"})
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": "run"}

    def test_internal_error_message(self):
        body = json.dumps(ERROR).encode()
        res = send("POST", body, {"X-Signature-256": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": "internal_error"}

    def test_verifies_exact_bytes(self):
        pretty = json.dumps(RUN, indent=2).encode()
        assert send("POST", pretty, {"X-Signature-256": sign(pretty)}).status_code == 200
        compact_sig = sign(json.dumps(RUN).encode())
        assert send("POST", pretty, {"X-Signature-256": compact_sig}).status_code == 401

    def test_any_content_type(self):
        body = json.dumps(ERROR).encode()
        res = send("POST", body, {"X-Signature-256": sign(body), "Content-Type": "text/plain"})
        assert res.status_code == 200

    def test_missing_signature(self):
        assert send("POST", json.dumps(RUN).encode()).status_code == 401

    def test_sha1_header_alone_is_rejected(self):
        body = json.dumps(RUN).encode()
        sha1 = hmac.new(SECRET.encode(), body, hashlib.sha1).hexdigest()
        assert send("POST", body, {"X-Signature": f"sha1={sha1}"}).status_code == 401

    def test_bad_signature(self):
        body = json.dumps(RUN).encode()
        assert send("POST", body, {"X-Signature-256": sign(body, "wrong")}).status_code == 401

    def test_signed_non_json_is_400(self):
        body = b"not json"
        assert send("POST", body, {"X-Signature-256": sign(body)}).status_code == 400

    def test_stale_state_version_ignored(self):
        newer = json.dumps({**RUN, "stateVersion": 5}).encode()
        older = json.dumps({**RUN, "stateVersion": 3}).encode()
        send("POST", newer, {"X-Signature-256": sign(newer)})
        res = send("POST", older, {"X-Signature-256": sign(older)})
        assert res.status_code == 200
        assert last_version[RUN["run"]["id"]] == 5


class TestMethods:
    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_other_methods(self, method):
        body = json.dumps(RUN).encode()
        assert send(method, body, {"X-Signature-256": sign(body)}).status_code == 200
        assert send(method, body, {"X-Signature-256": sign(body, "wrong")}).status_code == 401

    def test_get_with_no_body_is_verified_over_zero_bytes(self):
        ok = send("GET", None, {"X-Signature-256": f"sha256={sign(b'')}"})
        assert ok.status_code == 200
        assert ok.json()["type"] == "unknown"
        assert send("GET").status_code == 401
