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
    "intent.succeeded": {"type": "payment", "id": "in_id123", "status": "succeeded", "amount_in_cents": 25000, "currency": "GTQ", "details": {"fee": 875}},
    "intent.pending": {"type": "bank_transfer", "id": "in_id124", "status": "pending", "details": {"bank_reference": "ref-1"}},
    "intent.failed": {"type": "payment", "id": "in_id125", "status": "failed", "details": {"failure_reason": "insufficient_funds"}},
    "intent.canceled": {"type": "crypto", "id": "in_id126", "status": "canceled"},
    "intent.paid": {"type": "balance", "id": "in_id127", "status": "paid", "amount_in_cents": 5000, "currency": "GTQ"},
    "subscription.create": {"id": "su_id123"},
    "subscription.past_due": {"id": "su_id123"},
    "subscription.pause": {"id": "su_id123"},
    "subscription.unpause": {"id": "su_id123"},
    "subscription.reactivate": {"id": "su_id123"},
    "subscription.update": {"id": "su_id123"},
    "subscription.item_added": {"id": "su_id123", "item": {"id": "it_1"}},
    "subscription.item_removed": {"id": "su_id123", "item": {"id": "it_1"}},
    "subscription.invoice_item_added": {"id": "su_id123"},
    "subscription.cancel": {"id": "su_id123"},
    "setup_intent.succeeded": {"id": "seti_id123"},
    "setup_intent.cancelled": {"id": "seti_id123"},
    "refund.create": {"id": "re_id123"},
    "dispute.create": {"id": "dp_id123"},
    "dispute.update": {"id": "dp_id123"},
    "verification.completed": {"connected": True, "account_id": "acc_id123"},
    "verification.rejected": {"connected": True, "account_id": "acc_id123", "document_errors": [{"document": "dpi", "error": "blurry"}]},
    "tax_invoice_settings.enabled": {"connected": True, "account_id": "acc_id123", "tax_invoicing": {"status": "enabled"}},
    "account_connection.create": {"account_id": "acc_id123"},
    "transfer.sent": {"id": "tr_id123"},
    "transfer.received": {"id": "tr_id123"},
    "withdrawal.create": {"withdrawal": {"id": "wd_1", "status": "pending"}, "transfer": {"id": "tr_1", "status": "pending"}},
    "withdrawal.update": {"withdrawal": {"id": "wd_1", "status": "sent"}, "transfer": {"id": "tr_1", "status": "sent"}},
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
    """prefix is 'svix' (Recurrente's own header names) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/recurrente",
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
    monkeypatch.setenv("RECURRENTE_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"event_type": event_type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "recurrente.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "recurrente.something.new"


def test_any_content_type_verifies():
    response = send(json.dumps({"event_type": "intent.succeeded", "id": "in_id123"}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"event_type": "intent.succeeded", "id": "in_id123"}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "intent.succeeded"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"event_type":"intent.succeeded"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "intent.succeeded"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/recurrente", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"intent.succeeded"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"intent.succeeded"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"intent.succeeded"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"intent.failed"}', msg_id, timestamp)
    response = send('{"event_type":"intent.succeeded"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"intent.succeeded"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("RECURRENTE_WEBHOOK_SECRET")
    assert send('{"event_type":"intent.succeeded"}').status_code == 500
