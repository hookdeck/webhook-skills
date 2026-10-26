import hashlib
import hmac
import json
import os
import time

# Set test environment variables before importing the app
os.environ["LANGFUSE_WEBHOOK_SECRET"] = "lf_whsec_test_2dbcbba19f644c07"
os.environ.pop("LANGFUSE_WEBHOOK_TOLERANCE_SECONDS", None)

import pytest
from fastapi.testclient import TestClient

from main import app, verify_langfuse_signature

client = TestClient(app)

SECRET = os.environ["LANGFUSE_WEBHOOK_SECRET"]
PATH = "/webhooks/langfuse"


def payload(action="created"):
    # Based on the documented created payload
    # (https://langfuse.com/docs/prompt-management/features/webhooks-slack-integrations)
    return {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2024-07-10T10:30:00Z",
        "type": "prompt-version",
        "apiVersion": "v1",
        "action": action,
        "prompt": {
            "id": "prompt_abc123",
            "name": "movie-critic",
            "version": 3,
            "projectId": "xyz789",
            "labels": ["production", "latest"],
            "prompt": "As a {{criticLevel}} movie critic, rate {{movie}} out of 10.",
            "type": "text",
            "config": {"key": "value"},
            "commitMessage": "Improved critic persona",
            "tags": ["entertainment"],
            "createdAt": "2024-07-10T10:30:00Z",
            "updatedAt": "2024-07-10T10:30:00Z",
        },
    }


def now():
    return str(int(time.time()))


def mac(body: bytes, timestamp=None, secret=SECRET) -> str:
    """Same algorithm as Langfuse: hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the secret's UTF-8 bytes."""
    timestamp = timestamp or now()
    return hmac.new(secret.encode("utf-8"), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def sign(body: bytes, timestamp=None, secret=SECRET) -> str:
    timestamp = timestamp or now()
    return f"t={timestamp},v1={mac(body, timestamp, secret)}"


def post(body, signature=None):
    if isinstance(body, str):
        body = body.encode()
    headers = {"content-type": "application/json"}
    if signature is not None:
        headers["x-langfuse-signature"] = signature
    return client.post(PATH, content=body, headers=headers)


@pytest.fixture(autouse=True)
def reset_tolerance():
    os.environ.pop("LANGFUSE_WEBHOOK_TOLERANCE_SECONDS", None)
    yield
    os.environ.pop("LANGFUSE_WEBHOOK_TOLERANCE_SECONDS", None)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = json.dumps(payload()).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_exact_bytes_received(self):
        body = (json.dumps(payload(), indent=4) + "\n").encode()  # unusual whitespace must survive
        assert post(body, sign(body)).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = json.dumps(payload()).encode()
        t = now()
        assert post(body, f"t={t},v1={mac(body, t).upper()}").status_code == 200

    def test_accepts_when_any_v1_matches_and_ignores_other_keys(self):
        body = json.dumps(payload()).encode()
        t = now()
        bad = "a" * 64
        assert post(body, f"t={t},v0={bad},v1={bad},v1={mac(body, t)}").status_code == 200

    def test_uses_t_exactly_as_sent(self):
        body = json.dumps(payload()).encode()
        t = "0001700000000"
        assert verify_langfuse_signature(body, f"t={t},v1={mac(body, t)}", SECRET) is True
        assert verify_langfuse_signature(body, f"t=1700000000,v1={mac(body, t)}", SECRET) is False

    def test_rejects_missing_header(self):
        assert post(json.dumps(payload())).status_code == 401

    def test_rejects_empty_header(self):
        assert post(json.dumps(payload()), "").status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(payload()).encode()
        tampered = body.replace(b"movie-critic", b"evil-prompt")
        assert post(tampered, sign(body)).status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(payload()).encode()
        assert post(body, sign(body, secret="some_other_secret")).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = json.dumps(payload()).encode()
        assert post(body, f"t=1,v1={mac(body, '1700000000')}").status_code == 401

    def test_rejects_header_without_t_or_v1(self):
        body = json.dumps(payload()).encode()
        assert post(body, f"v1={mac(body, '1700000000')}").status_code == 401
        assert post(body, f"t=1700000000,v0={mac(body, '1700000000')}").status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(payload()).encode()
        t = now()
        good = mac(body, t)
        for bad in [good[:62], good + "00", "z" * 64, good[:63] + "g", ""]:
            assert post(body, f"t={t},v1={bad}").status_code == 401
        assert post(body, "not-a-signature").status_code == 401

    def test_rejects_when_no_secret_configured(self):
        body = b"{}"
        assert verify_langfuse_signature(body, sign(body), "") is False


class TestTimestampTolerance:
    OLD = str(int(time.time()) - 86400)

    def test_old_timestamps_accepted_by_default(self):
        body = json.dumps(payload()).encode()
        assert post(body, sign(body, self.OLD)).status_code == 200

    def test_old_timestamps_rejected_when_tolerance_set(self):
        os.environ["LANGFUSE_WEBHOOK_TOLERANCE_SECONDS"] = "300"
        body = json.dumps(payload()).encode()
        assert post(body, sign(body, self.OLD)).status_code == 401
        assert post(body, sign(body)).status_code == 200

    def test_non_numeric_t_rejected_when_tolerance_on(self):
        body = b"{}"
        assert verify_langfuse_signature(body, f"t=abc,v1={mac(body, 'abc')}", SECRET, 300) is False


class TestEventHandling:
    @pytest.mark.parametrize("action", ["created", "updated", "deleted"])
    def test_handles_documented_actions(self, action):
        body = json.dumps(payload(action)).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_acknowledges_unknown_actions(self):
        body = json.dumps(payload("archived")).encode()
        assert post(body, sign(body)).status_code == 200

    def test_invalid_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
