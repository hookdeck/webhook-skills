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

# Every documented event type and the resource kind in the top-level `object`
EVENTS = {
    "email.received": "email_inbound",
    "message.archived": "message",
    "message.deleted": "message",
    "message.delivered": "message",
    "message.failed": "message",
    "message.read": "message",
    "message.seen": "message",
    "message.sent": "message",
    "message.snoozed": "message",
    "message.unarchived": "message",
    "message.unread": "message",
    "message.unsnoozed": "message",
    "preference.updated": "preference",
    "workflow.created": "workflow",
    "workflow.deleted": "workflow",
    "workflow.published": "workflow",
    "workflow.updated": "workflow",
}


def data_for(event_type: str, obj: str) -> dict:
    """Documented `data` shapes: messages use `_id`, preferences add `subscriberId`, inbound email has `mail`."""
    if obj == "email_inbound":
        return {"object": {"domain": {"id": "domain_01J", "name": "mail.example.com"},
                           "route": {"address": "support"}, "mail": {"subject": "Re: Your order"}}}
    if obj == "preference":
        return {"subscriberId": "subscriber_123", "object": {"level": "global", "enabled": True, "channels": {"email": True}}}
    if obj == "workflow":
        data = {"object": {"workflowId": "order-shipped", "name": "Order shipped"}}
        if event_type == "workflow.updated":
            data["previousObject"] = {"_id": "wf_01J"}
        return data
    failed = event_type == "message.failed"
    data = {"object": {"_id": "message_01J", "subscriberId": "subscriber_123", "channel": "push",
                       "status": "error" if failed else "sent"}}
    if failed:
        data["error"] = {"message": "Requested entity was not found."}
    return data


def envelope(event_type: str, obj: str) -> str:
    """Envelope: {id, type, object, timestamp, environmentId, data: {object, previousObject?}}."""
    data = data_for(event_type, obj)
    return json.dumps({
        "id": "evt_01J",
        "type": event_type,
        "object": obj,
        "timestamp": "2026-10-26T12:00:00.000Z",
        "environmentId": "env_01J",
        "data": data,
    })


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "webhook"):
    """prefix is 'webhook' (Novu's Standard Webhooks names) or 'svix' (the same values under Svix's names)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/novu",
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
    monkeypatch.setenv("NOVU_WEBHOOK_SECRET", TEST_SECRET)


class TestNovuWebhook:
    @pytest.mark.parametrize("event_type,obj", list(EVENTS.items()))
    def test_handles_documented_events(self, event_type, obj):
        res = send(envelope(event_type, obj))
        assert res.status_code == 200
        assert res.json() == {"success": True, "type": event_type}

    def test_handles_unknown_event_types(self):
        res = send(envelope("novu.something.new", "message"))
        assert res.status_code == 200
        assert res.json()["type"] == "novu.something.new"

    def test_verifies_regardless_of_content_type(self):
        res = send(envelope("message.failed", "message"), content_type="application/octet-stream")
        assert res.status_code == 200

    def test_accepts_svix_prefixed_headers(self):
        res = send(envelope("message.delivered", "message"), prefix="svix")
        assert res.status_code == 200
        assert res.json() == {"success": True, "type": "message.delivered"}

    def test_rejects_invalid_signature_with_svix_headers(self):
        res = send(envelope("message.delivered", "message"), prefix="svix", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_accepts_any_matching_signature_among_several(self):
        payload = envelope("workflow.published", "workflow")
        msg_id, ts = "msg_rotation", now()
        signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, ts)}"
        assert send(payload, msg_id, ts, signature).status_code == 200

    def test_ignores_signature_versions_other_than_v1(self):
        payload = envelope("workflow.published", "workflow")
        msg_id, ts = "msg_v1a", now()
        signature = sign(payload, msg_id, ts).replace("v1,", "v1a,")
        assert send(payload, msg_id, ts, signature).status_code == 400

    def test_rejects_missing_headers(self):
        res = client.post("/webhooks/novu", content="{}", headers={"content-type": "application/json"})
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing required webhook headers"

    def test_rejects_invalid_signature(self):
        res = send(envelope("message.failed", "message"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_malformed_signature_entry(self):
        res = send(envelope("message.failed", "message"), signature="v1,%%%not-base64%%%")
        assert res.status_code == 400

    def test_rejects_signature_from_different_secret(self):
        payload = envelope("message.failed", "message")
        msg_id, ts = "msg_other", now()
        signature = sign(payload, msg_id, ts, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
        assert send(payload, msg_id, ts, signature).status_code == 400

    def test_rejects_tampered_body(self):
        msg_id, ts = "msg_tamper", now()
        signature = sign(envelope("message.failed", "message"), msg_id, ts)
        res = send(envelope("message.sent", "message"), msg_id, ts, signature)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_timestamp_older_than_five_minutes(self):
        res = send(envelope("message.failed", "message"), timestamp=str(int(time.time()) - 600))
        assert res.status_code == 400
        assert res.json()["detail"] == "Timestamp too old"

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("NOVU_WEBHOOK_SECRET")
        assert send(envelope("message.failed", "message")).status_code == 500

    def test_health_check(self):
        assert client.get("/health").json() == {"status": "ok"}
