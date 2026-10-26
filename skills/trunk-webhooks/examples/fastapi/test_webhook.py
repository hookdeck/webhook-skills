import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

EVENTS = {
    "pull_request.queued": {"action": "queued", "status": "QUEUED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.submitted": {"action": "submitted", "status": "SUBMITTED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.testing": {"action": "testing", "status": "TESTING", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.pending_failure": {"action": "pending_failure", "status": "PENDING_FAILURE", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.failed": {"action": "failed", "status": "FAILED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.canceled": {"action": "canceled", "status": "CANCELED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request.merged": {"action": "merged", "status": "MERGED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.queued": {"action": "queued", "status": "QUEUED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.submitted": {"action": "submitted", "status": "SUBMITTED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.testing": {"action": "testing", "status": "TESTING", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.pending_failure": {"action": "pending_failure", "status": "PENDING_FAILURE", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.failed": {"action": "failed", "status": "FAILED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.canceled": {"action": "canceled", "status": "CANCELED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "pull_request_batch.merged": {"action": "merged", "status": "MERGED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
    "test_case.status_changed": {"previous_status": "HEALTHY", "new_status": "FLAKY", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
    "v2.test_case.status_changed": {"previous_status": "HEALTHY", "new_status": "FLAKY", "triggered_by": {"monitor_id": "0e6b1a9c-5d27-4c83-8f14-b7a2d9c3e508", "monitor_type": "pass_on_retry", "monitor_status": "active"}, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
    "test_case.monitor_status_changed": {"monitor": {"id": "0e6b1a9c-5d27-4c83-8f14-b7a2d9c3e508", "type": "pass_on_retry", "status": "active"}, "evidence": {}, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
    "test_case.quarantining_setting_changed": {"repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
    "v2.test_case.quarantining_setting_changed": {"repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
    "test_case.investigation_completed": {"investigation_id": "c3a7f1d0-9b42-4e68-8d15-2f6e0a9b4c71", "trigger": "AUTOMATIC", "confidence": 0.82, "created_at": "2026-08-25T11:40:32.000Z", "markdown_summary": "The test races with a seeded fixture.", "failure_message": "expected 200, got 500", "facts": [{"fact_type": "GIT_BLAME", "content": "Last changed in a1b2c3d", "confidence": 0.9}], "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": False, "variant": ""}},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Trunk) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/trunk",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("TRUNK_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,fields", list(EVENTS.items()))
def test_handles_events(event_type, fields):
    response = send(json.dumps({"type": event_type, "timestamp": "2026-08-25T11:40:32.000Z", **fields}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_type():
    response = send(json.dumps({"type": "pull_request.something_new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "pull_request.something_new"


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "pull_request.merged", "pr_number": 1234}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "pull_request.merged", "pr_number": 1234}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "pull_request.merged"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"pull_request.merged"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "pull_request.merged"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/trunk", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"pull_request.merged"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"pull_request.merged"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"pull_request.merged"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"pull_request.failed"}', msg_id, timestamp)
    response = send('{"type":"pull_request.merged"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"pull_request.merged"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("TRUNK_WEBHOOK_SECRET")
    assert send('{"type":"pull_request.merged"}').status_code == 500
