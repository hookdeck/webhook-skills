# Generated with: fanvue-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

TOLERANCE_SECONDS = 300
PROBE_TYPE = "fanvue.webhook.verification"
_DECIMAL = re.compile(r"[0-9]+")


def parse_signature_header(header: str) -> tuple[str | None, int, list[str]]:
    """Parse X-Fanvue-Signature into (timestamp, timestamp_count, macs).

    Format: "t=<unix seconds>,v0=<hex>" or, during a signing-secret rotation,
    "t=<unix seconds>,v0=<old hex>,<new hex>".

    The parser is stateful on purpose: a field without "=" continues the list
    of the previous key, which is how the rotation MAC joins v0. A dict built
    from split("=") would silently drop it.
    """
    key = None
    timestamp = None
    timestamp_count = 0
    macs: list[str] = []

    for field in header.split(","):
        if "=" in field:
            key, _, value = field.partition("=")
            key = key.strip()
        else:
            value = field
        value = value.strip()
        if key == "t":
            timestamp = value
            timestamp_count += 1
        elif key == "v0" and value:
            macs.append(value.lower())

    return timestamp, timestamp_count, macs


def verify_fanvue_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_seconds: int = TOLERANCE_SECONDS,
    now: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a Fanvue webhook signature.

    Signed content: f"{t}." + raw body bytes (not re-serialised JSON)
    Algorithm:      HMAC-SHA256 keyed with the signing secret as given, hex digest
    """
    if not header:
        return False, "Missing X-Fanvue-Signature header"

    timestamp, timestamp_count, macs = parse_signature_header(header)
    if timestamp_count != 1 or not timestamp or not _DECIMAL.fullmatch(timestamp) or not macs:
        return False, "Malformed X-Fanvue-Signature header"

    # t is inside the signed content, so it can't be refreshed on a replay.
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > tolerance_seconds:
        return False, "Timestamp outside tolerance"

    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Accept when ANY MAC matches (two MACs are sent during secret rotation).
    if any(hmac.compare_digest(expected, mac) for mac in macs):
        return True, None
    return False, "Invalid signature"


def idempotency_key(event: dict[str, Any]) -> str | None:
    """Deduplication key: id on envelope events, eventId on legacy flat events.

    Two documented exceptions need the timestamp folded in.
    """
    event_type = event.get("type")
    if isinstance(event_type, str):
        # app.subscription.* ids hash subscription id + topic, so a repeated
        # transition reuses the earlier id.
        if event_type.startswith("app.subscription."):
            return f"{event.get('id')}:{event.get('timestamp')}"
        return event.get("id")
    # Legacy message.read reuses one eventId for every receipt in a conversation.
    if "readMessagesCount" in event:
        return f"{event.get('eventId')}:{event.get('timestamp')}"
    return event.get("id") or event.get("eventId")


CREATOR_EVENTS = {
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
}

CHECKOUT_EVENTS = {
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
}

APP_EVENTS = {
    "app.payment.pending",
    "app.payment.succeeded",
    "app.payment.failed",
    "app.subscription.activated",
    "app.subscription.cancel_at_period_end_changed",
    "app.refund.created",
    "app.payment.refunded",  # deprecated alias of app.refund.created
    "app.dispute.flagged",
    "app.dispute.created",
    "app.experience.action.payment.pending",
    "app.experience.action.payment.succeeded",
    "app.experience.action.payment.failed",
    "app.experience.action.refund.created",
    "app.experience.action.dispute.flagged",
    "app.experience.action.dispute.created",
}


def handle_envelope_event(event: dict[str, Any]) -> None:
    event_type = event["type"]
    data = event.get("data") or {}

    if event_type == "creator.payment.succeeded":
        # Money is in minor units; renewals arrive here with source "subscription".
        print(
            f"Payment {data.get('id')}: {data.get('gross')} {data.get('currency')} "
            f"(source: {data.get('source')}, {data.get('billing_reason')})"
        )
    elif event_type == "creator.message.mass_sent":
        # Broadcasts arrive here and never on creator.message.sent.
        print(f"Mass message sent: {data.get('id')}")
    elif event_type == "creator.chat.marked_unread":
        # Conversation state, not message state: don't revert read ticks.
        print(f"Chat marked unread: {data.get('object')}")
    elif event_type == "creator.follow.created":
        # data.id is always null; identity is the (follower, creator) pair.
        follower = data.get("follower") or {}
        creator = data.get("creator") or {}
        print(f"New follower {follower.get('handle')} for creator {creator.get('uuid')}")
    elif event_type in CREATOR_EVENTS:
        print(f"{event_type}: {data.get('id')}")
    elif event_type in CHECKOUT_EVENTS:
        print(f"{event_type}: {data.get('id')}")
    elif event_type in APP_EVENTS:
        # For app.subscription.*, read live state from
        # GET /apps/{appUuid}/subscription-status.
        print(f"{event_type}: {data.get('id')}")
    else:
        # Answer 2xx for unknown types: a 4xx counts as a failure and walks the
        # endpoint towards auto-disable.
        print(f"Unhandled Fanvue event type: {event_type}")


def handle_legacy_event(event: dict[str, Any]) -> None:
    # Legacy flat events (follow.new, purchase.new, tip.new, subscription.*,
    # message.received, message.read) are deprecated and their body never names
    # the topic. Migrate to the creator.* replacement rather than branching on
    # field presence; subscribing to both counts every occurrence twice.
    print(f"Legacy Fanvue event for creator {event.get('recipientUuid')}")


@app.post("/webhooks/fanvue")
async def fanvue_webhook(request: Request):
    # Read the raw bytes Fanvue signed before anything parses them.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        event = None

    # 1. Verification probe. POST /webhooks/subscriptions sends one UNSIGNED
    #    {"type":"fanvue.webhook.verification"} body and fails unless it gets a
    #    2xx. Answer it before checking signatures; it carries no event data,
    #    so nothing is processed on this path.
    if isinstance(event, dict) and event.get("type") == PROBE_TYPE:
        return {"ok": True}

    secret = os.environ.get("FANVUE_WEBHOOK_SECRET")
    if not secret:
        print("FANVUE_WEBHOOK_SECRET is not set")
        return JSONResponse(status_code=500, content={"error": "Webhook secret not configured"})

    # 2. Every other request must carry a valid X-Fanvue-Signature.
    valid, error = verify_fanvue_signature(
        raw_body, request.headers.get("x-fanvue-signature"), secret
    )
    if not valid:
        print(f"Fanvue webhook verification failed: {error}")
        return JSONResponse(status_code=401, content={"error": error})

    if not isinstance(event, dict):
        return JSONResponse(status_code=400, content={"error": "Invalid JSON payload"})

    # 3. Route on the signed body, never on the unauthenticated X-Fanvue-Topic
    #    header. In production: persist the event under this key, return 2xx,
    #    then process asynchronously.
    key = idempotency_key(event)
    print(f"Fanvue event {key}")

    if isinstance(event.get("type"), str) and isinstance(event.get("data"), dict):
        handle_envelope_event(event)
    else:
        handle_legacy_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
