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

# Example payloads from Dots' event catalog (ids only)
EVENTS = {
    "payment_intent.updated": {"payment_intent_id": "payment-intent-id"},
    "payment_method.updated": {"payment_method_id": "payment-method-id"},
    "flow.updated": {"flow_id": "flow-id"},
    "dispute.updated": {"dispute_id": "dispute-id"},
    "payout_request.updated": {"payout_request_id": "payout-request-id"},
    "organization.updated": {"organization_id": "organization-id"},
    "app.updated": {"app_id": "app-id"},
    "transfer.updated": {"transfer_id": "transfer-id"},
    "payout_link.updated": {"payout_link_id": "payout-link-id"},
    "user.updated": {"user_id": "user-id"},
    "user.onboarded": {"ach_account_id": "ach-account-id", "flow_id": "flow-id", "transfer_id": "transfer-id", "user_id": "user-id"},
    "user.onboarding_revoked": {"ach_account_id": "ach-account-id", "flow_id": "flow-id", "reason": "Insufficient funds", "transfer_id": "transfer-id", "user_id": "user-id"},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None, content_type: str = "application/json", prefix: str = "svix"):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/dots",
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
    monkeypatch.setenv("DOTS_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event": event_type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_app_originated_event_with_api_app_id():
    response = send(json.dumps({"event": "flow.updated", "flow_id": "flow-id", "api_app_id": "app-id"}))
    assert response.status_code == 200


def test_unknown_event_type():
    response = send(json.dumps({"event": "widget.updated"}))
    assert response.status_code == 200
    assert response.json()["type"] == "widget.updated"


def test_any_content_type_verifies():
    response = send(json.dumps({"event": "user.updated", "user_id": "user-id"}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """The same delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event": "transfer.updated", "transfer_id": "transfer-id"}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "transfer.updated"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event":"transfer.updated"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_does_not_mix_header_sets():
    payload = '{"event":"transfer.updated"}'
    timestamp = now()
    response = client.post(
        "/webhooks/dots",
        content=payload,
        headers={
            "content-type": "application/json",
            "svix-id": "msg_mixed",
            "webhook-timestamp": timestamp,
            "webhook-signature": sign(payload, "msg_mixed", timestamp),
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event": "flow.updated", "flow_id": "flow-id"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/dots", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event":"flow.updated"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event":"flow.updated"}', signature="not-a-signature")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event":"flow.updated"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event":"transfer.updated","transfer_id":"a"}', msg_id, timestamp)
    response = send('{"event":"transfer.updated","transfer_id":"b"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event":"flow.updated"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("DOTS_WEBHOOK_SECRET")
    assert send('{"event":"flow.updated"}').status_code == 500
