import hashlib
import hmac
import json
import os
import time

# Fanvue secrets are used verbatim as the HMAC key. API subscriptions return
# "whsec_" + 64 hex characters; the prefix is part of the key (no stripping).
SECRET = "whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708"
os.environ["FANVUE_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    idempotency_key,
    parse_signature_header,
    verify_fanvue_signature,
)

client = TestClient(app)


def sign(payload: str, secret: str = SECRET, timestamp: int | str | None = None) -> str:
    t = int(time.time()) if timestamp is None else timestamp
    return hmac.new(secret.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()


def signature_header(payload: str, secrets: list[str] | None = None, timestamp: int | None = None) -> str:
    """Build X-Fanvue-Signature: t=<seconds>,v0=<hex>[,<hex>...]"""
    t = int(time.time()) if timestamp is None else timestamp
    macs = [sign(payload, s, t) for s in (secrets or [SECRET])]
    return f"t={t},v0={','.join(macs)}"


def post(payload: str, headers: dict[str, str] | None = None):
    return client.post(
        "/webhooks/fanvue",
        content=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


FOLLOW_CREATED = {
    "id": "f1a2b3c4-7777-4a2b-9c3d-aaaaaaaaaaaa",
    "type": "creator.follow.created",
    "timestamp": "2026-06-09T08:39:33.139Z",
    "data": {
        "object": "follow",
        "id": None,
        "created_at": "2026-06-09T08:39:33.139Z",
        "follower": {"uuid": "fan-uuid", "email": None, "handle": "janed", "display_name": "Jane D"},
        "creator": {"uuid": "creator-uuid"},
        "metadata": {},
        "tracking": {
            "link_url": "https://fanvue.com/creator-handle?fvc=summer-campaign",
            "metadata": {"campaign": "summer", "source": "x"},
        },
    },
}

PAYMENT_SUCCEEDED = {
    "id": "f1a2b3c4-1111-4a2b-9c3d-aaaaaaaaaaaa",
    "type": "creator.payment.succeeded",
    "timestamp": "2026-06-09T08:39:33.139Z",
    "data": {
        "object": "payment",
        "id": "FV-12345",
        "status": "succeeded",
        "source": "message",
        "billing_reason": "one_time",
        "gross": 1999,
        "net": 1799,
        "fees": {"fanvue_fee": 200, "transaction_fee": 0},
        "currency": "USD",
        "purchaser": {"uuid": "fan-uuid", "email": None, "handle": "janed", "display_name": "Jane D"},
        "creator": {"uuid": "creator-uuid"},
        "metadata": {},
    },
}

LIVE_EVENT_TYPES = [
    "creator.payment.succeeded",
    "creator.reward.created",
    "creator.reward.reversed",
    "creator.subscription.activated",
    "creator.subscription.renewed",
    "creator.subscription.deactivated",
    "creator.subscription.cancel_at_period_end_changed",
    "creator.experience_subscription.activated",
    "creator.experience_subscription.deactivated",
    "creator.message.received",
    "creator.message.sent",
    "creator.message.mass_sent",
    "creator.message.read",
    "creator.message.read_by_fan",
    "creator.message.deleted",
    "creator.message.reaction",
    "creator.chat.marked_unread",
    "creator.follow.created",
    "creator.post.liked",
    "creator.post.commented",
    "creator.refund.created",
    "creator.dispute.flagged",
    "creator.dispute.created",
    "creator.fan.status_changed",
    "creator.fan.presence_changed",
    "checkout_link.payment.pending",
    "checkout_link.payment.succeeded",
    "checkout_link.payment.failed",
    "checkout_link.subscription.activated",
    "checkout_link.subscription.deactivated",
    "checkout_link.subscription.cancel_at_period_end_changed",
    "checkout_link.refund.created",
    "checkout_link.refund.requested",
    "checkout_link.dispute.flagged",
    "checkout_link.dispute.created",
    "checkout_link.installment.paid",
    "checkout_link.installment.failed",
    "checkout_link.plan.completed",
    "payout.paid",
    "payout.failed",
    "app.payment.pending",
    "app.payment.succeeded",
    "app.payment.failed",
    "app.subscription.activated",
    "app.subscription.cancel_at_period_end_changed",
    "app.refund.created",
    "app.payment.refunded",
    "app.dispute.flagged",
    "app.dispute.created",
    "app.experience.action.payment.pending",
    "app.experience.action.payment.succeeded",
    "app.experience.action.payment.failed",
    "app.experience.action.refund.created",
    "app.experience.action.dispute.flagged",
    "app.experience.action.dispute.created",
    "unknown.future.event",
]


class TestParseSignatureHeader:
    def test_keeps_bare_rotation_mac_in_v0_list(self):
        assert parse_signature_header("t=1700000000,v0=old,new") == ("1700000000", 1, ["old", "new"])


class TestVerifyFanvueSignature:
    body = json.dumps(FOLLOW_CREATED)

    def test_accepts_valid_signature(self):
        assert verify_fanvue_signature(self.body.encode(), signature_header(self.body), SECRET) == (True, None)

    def test_uses_whsec_secret_verbatim(self):
        header = signature_header(self.body, secrets=[SECRET[len("whsec_"):]])
        assert verify_fanvue_signature(self.body.encode(), header, SECRET)[0] is False

    def test_accepts_when_only_second_rotation_mac_matches(self):
        header = signature_header(self.body, secrets=["old_secret", SECRET])
        assert verify_fanvue_signature(self.body.encode(), header, SECRET) == (True, None)

    def test_accepts_uppercase_hex(self):
        # Hookdeck's own FANVUE verifier lowercases MACs before comparing.
        t = int(time.time())
        header = f"t={t},v0={sign(self.body, SECRET, t).upper()}"
        assert verify_fanvue_signature(self.body.encode(), header, SECRET) == (True, None)

    @pytest.mark.parametrize(
        "header_fn",
        [
            lambda b, t: f"v0={sign(b, SECRET, t)}",  # missing t
            lambda b, t: f"t={t},t={t},v0={sign(b, SECRET, t)}",  # repeated t
            lambda b, t: f"t=1e9,v0={sign(b, SECRET, '1e9')}",  # non-decimal t
            lambda b, t: f"t=١٢,v0={sign(b, SECRET, t)}",  # non-ASCII digits
            lambda b, t: f"t={t}",  # no MAC
        ],
    )
    def test_rejects_malformed_headers(self, header_fn):
        t = int(time.time())
        valid, error = verify_fanvue_signature(self.body.encode(), header_fn(self.body, t), SECRET)
        assert valid is False
        assert "Malformed" in error

    @pytest.mark.parametrize("offset", [-301, 301])
    def test_rejects_stale_and_future_timestamps(self, offset):
        header = signature_header(self.body, timestamp=int(time.time()) + offset)
        valid, error = verify_fanvue_signature(self.body.encode(), header, SECRET)
        assert valid is False
        assert "Timestamp" in error


class TestIdempotencyKey:
    def test_uses_id_for_envelope_events(self):
        assert idempotency_key(PAYMENT_SUCCEEDED) == PAYMENT_SUCCEEDED["id"]
        assert idempotency_key({"id": "a", "type": "creator.subscription.renewed", "timestamp": "t", "data": {}}) == "a"

    def test_pairs_id_with_timestamp_for_app_subscription(self):
        event = {"id": "a", "type": "app.subscription.activated", "timestamp": "t1", "data": {}}
        assert idempotency_key(event) == "a:t1"

    def test_legacy_event_ids(self):
        assert idempotency_key({"recipientUuid": "r", "eventId": "e1", "timestamp": "t"}) == "e1"
        legacy_read = {"readMessagesCount": 5, "recipientUuid": "r", "eventId": "e1", "timestamp": "t1"}
        assert idempotency_key(legacy_read) == "e1:t1"


class TestFanvueWebhook:
    def test_answers_unsigned_verification_probe(self):
        response = post(json.dumps({"type": "fanvue.webhook.verification", "timestamp": "2026-06-09T08:39:33.139Z"}))
        assert response.status_code == 200

    def test_rejects_other_unsigned_requests_with_401(self):
        response = post(json.dumps(FOLLOW_CREATED))
        assert response.status_code == 401
        assert "Missing X-Fanvue-Signature" in response.json()["error"]

    def test_rejects_unsigned_non_json_with_401(self):
        assert post("not json").status_code == 401

    def test_rejects_tampered_payload(self):
        original = json.dumps(PAYMENT_SUCCEEDED)
        tampered = json.dumps({**PAYMENT_SUCCEEDED, "data": {**PAYMENT_SUCCEEDED["data"], "gross": 1}})
        response = post(tampered, {"X-Fanvue-Signature": signature_header(original)})
        assert response.status_code == 401
        assert response.json()["error"] == "Invalid signature"

    def test_rejects_reserialised_body(self):
        raw = json.dumps(FOLLOW_CREATED, indent=2)
        reserialised = json.dumps(json.loads(raw))
        response = post(reserialised, {"X-Fanvue-Signature": signature_header(raw)})
        assert response.status_code == 401

    def test_accepts_valid_signature(self):
        payload = json.dumps(PAYMENT_SUCCEEDED)
        response = post(payload, {"X-Fanvue-Signature": signature_header(payload)})
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_newer_secret_in_second_mac_during_rotation(self):
        payload = json.dumps(FOLLOW_CREATED)
        header = signature_header(payload, secrets=["previous_secret", SECRET])
        assert post(payload, {"X-Fanvue-Signature": header}).status_code == 200

    def test_accepts_signed_legacy_flat_event(self):
        payload = json.dumps(
            {
                "recipientUuid": "f4b2a184-2b4a-4a04-9b70-3c0e0a1caa12",
                "sender": {"displayName": "Test User", "handle": "test-user", "uuid": "5939ae62-3eb5-4433-954f-f78c7b4282f3"},
                "trackingLinkId": "spring-promo",
                "timestamp": "2025-11-06T10:32:49.880Z",
            }
        )
        assert post(payload, {"X-Fanvue-Signature": signature_header(payload)}).status_code == 200

    @pytest.mark.parametrize("event_type", LIVE_EVENT_TYPES)
    def test_handles_every_live_event_type(self, event_type):
        payload = json.dumps(
            {
                "id": f"evt-{event_type}",
                "type": event_type,
                "timestamp": "2026-06-09T08:39:33.139Z",
                "data": {"object": "test", "id": "TEST-1"},
            }
        )
        response = post(payload, {"X-Fanvue-Signature": signature_header(payload)})
        assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
