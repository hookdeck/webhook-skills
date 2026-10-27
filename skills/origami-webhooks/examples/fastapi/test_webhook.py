import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

SENDER = {"id": "0b1c6a54-2d3e-4f50-8a61-7b2c9d0e1f23", "email": "sdr@example.com", "linkedin_slug": None, "display_name": "Sam SDR"}
TARGET = {"table_id": "a1", "row_id": "b2", "column_id": "c3", "email": "lead@example.com",
          "linkedin_urn": None, "linkedin_slug": "lead-slug"}
SEQ = {"sequence_id": "s1", "campaign_id": "camp_1", "step_index": 0, "outreach_target": TARGET, "sender": SENDER}


def job_data(status: str, **extra) -> dict:
    return {"job_id": "job_01J", "operation": "leads.searches.create", "status": status, "sequence": 3,
            "target": None, "metadata": {"order": "42"}, "credits": None,
            "summary": {"list_id": "list_1", "added": 25}, "error": None, "needs_input": None, **extra}


# Every documented event type with a documented `data` shape (see references/overview.md)
EVENTS = {
    "job.succeeded": job_data("succeeded"),
    "job.failed": job_data("failed", error={"code": "agent_error", "message": "Search failed"}),
    "job.cancelled": job_data("cancelled"),
    "job.needs_input": job_data("needs_input", needs_input={"questions": [{"id": "q1", "text": "Which region?"}]}),
    "table.run.completed": {"run_id": "r1", "table_id": "t1", "source": "api", "status": "complete",
                            "failure_reason": None, "counts": {"complete": 9, "errored": 1, "cancelled": 0}},
    "sequence.message.sent": {"channel": "email", **SEQ, "message_id": "m1",
                              "message": {"subject": "Hi", "body": "Hello", "body_truncated": False,
                                          "provider_id": "gmail_1", "thread_id": None, "rfc_message_id": None},
                              "sent_at": "2026-10-26T12:00:00Z"},
    "sequence.reply.received": {"channel": "linkedin", **SEQ, "newly_stopped": True,
                                "reply_message": {"subject": None, "body": "Sounds good",
                                                  "received_at": "2026-10-26T12:05:00Z"}},
    "sequence.connection.requested": {"channel": "linkedin", **SEQ, "message_id": "m2",
                                      "message": {"subject": None, "body": "", "body_truncated": False,
                                                  "provider_id": None, "thread_id": None, "rfc_message_id": None},
                                      "sent_at": "2026-10-26T12:00:00Z"},
    "sequence.connection.accepted": {"channel": "linkedin", **SEQ, "original_message_id": "m2",
                                     "requested_at": "2026-10-25T12:00:00Z", "connected_at": "2026-10-26T12:00:00Z"},
    "sequence.comment.posted": {"channel": "linkedin", **SEQ, "message_id": "m3",
                                "comment": {"body": "Great post", "body_truncated": False, "comment_id": "cm1",
                                            "post_url": "https://www.linkedin.com/feed/update/1"},
                                "posted_at": "2026-10-26T12:00:00Z"},
    "webhook.test": {"triggered_by": "dashboard", "triggered_at": "2026-10-26T12:00:00Z",
                     "message": "Test event from Origami"},
}


def envelope(event_type: str, data: dict = None) -> str:
    """Envelope: {type, id, timestamp, data}. `id` equals the webhook-id header; `timestamp` is the event time."""
    return json.dumps({
        "type": event_type,
        "id": "evt_01J",
        "timestamp": "2026-10-26T12:00:00.000Z",
        "data": EVENTS[event_type] if data is None else data,
    })


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "webhook"):
    """prefix is 'webhook' (Origami's Standard Webhooks names) or 'svix' (the same values under Svix's names)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/origami",
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
    monkeypatch.setenv("ORIGAMI_WEBHOOK_SECRET", TEST_SECRET)


class TestOrigamiWebhook:
    @pytest.mark.parametrize("event_type", list(EVENTS))
    def test_handles_documented_events(self, event_type):
        res = send(envelope(event_type))
        assert res.status_code == 200
        assert res.json() == {"success": True, "type": event_type}

    def test_handles_unknown_event_types(self):
        res = send(envelope("origami.something.new", {}))
        assert res.status_code == 200
        assert res.json()["type"] == "origami.something.new"

    def test_verifies_regardless_of_content_type(self):
        res = send(envelope("job.failed"), content_type="application/octet-stream")
        assert res.status_code == 200

    def test_accepts_svix_prefixed_headers(self):
        res = send(envelope("table.run.completed"), prefix="svix")
        assert res.status_code == 200
        assert res.json() == {"success": True, "type": "table.run.completed"}

    def test_rejects_invalid_signature_with_svix_headers(self):
        res = send(envelope("table.run.completed"), prefix="svix", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_accepts_any_matching_signature_among_several(self):
        payload = envelope("sequence.reply.received")
        msg_id, ts = "msg_rotation", now()
        signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, ts)}"
        assert send(payload, msg_id, ts, signature).status_code == 200

    def test_ignores_signature_versions_other_than_v1(self):
        payload = envelope("sequence.reply.received")
        msg_id, ts = "msg_v1a", now()
        signature = sign(payload, msg_id, ts).replace("v1,", "v1a,")
        assert send(payload, msg_id, ts, signature).status_code == 400

    def test_rejects_missing_headers(self):
        res = client.post("/webhooks/origami", content="{}", headers={"content-type": "application/json"})
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing required webhook headers"

    def test_rejects_invalid_signature(self):
        res = send(envelope("job.failed"), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_malformed_signature_entry(self):
        res = send(envelope("job.failed"), signature="v1,%%%not-base64%%%")
        assert res.status_code == 400

    def test_rejects_signature_from_different_secret(self):
        payload = envelope("job.failed")
        msg_id, ts = "msg_other", now()
        signature = sign(payload, msg_id, ts, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
        assert send(payload, msg_id, ts, signature).status_code == 400

    def test_rejects_tampered_body(self):
        msg_id, ts = "msg_tamper", now()
        signature = sign(envelope("job.failed"), msg_id, ts)
        res = send(envelope("job.succeeded"), msg_id, ts, signature)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_timestamp_older_than_five_minutes(self):
        res = send(envelope("job.failed"), timestamp=str(int(time.time()) - 600))
        assert res.status_code == 400
        assert res.json()["detail"] == "Timestamp too old"

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("ORIGAMI_WEBHOOK_SECRET")
        assert send(envelope("job.failed")).status_code == 500

    def test_health_check(self):
        assert client.get("/health").json() == {"status": "ok"}
