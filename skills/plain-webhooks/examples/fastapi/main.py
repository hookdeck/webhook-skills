# Generated with: plain-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

_HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


def verify_plain_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """
    Verify a Plain request signature.
    Plain sends hex(HMAC-SHA256(secret, rawBody)) in the Plain-Request-Signature header.
    """
    if not signature or not secret:
        return False
    # Reject anything that is not exactly 64 hex chars before comparing.
    if not _HEX64.match(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header gives a mismatch, not a TypeError.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def is_timestamp_fresh(event: dict, tolerance_seconds: float) -> bool:
    """Optional replay check on webhookMetadata.webhookDeliveryAttemptTimestamp (in the body)."""
    try:
        raw = event["webhookMetadata"]["webhookDeliveryAttemptTimestamp"]
        ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError, AttributeError):
        return False
    return abs((datetime.now(timezone.utc) - ts).total_seconds()) <= tolerance_seconds


@app.post("/webhooks/plain")
async def plain_webhook(request: Request):
    secret = os.environ.get("PLAIN_WEBHOOK_SECRET", "")
    if not secret:
        return Response(content="Webhook secret not configured", status_code=500)

    # Read the raw body for signature verification (do not parse JSON first).
    raw_body = await request.body()
    signature = request.headers.get("plain-request-signature")

    if not signature:
        return Response(content="Missing Plain-Request-Signature header", status_code=400)

    if not verify_plain_signature(raw_body, signature, secret):
        return Response(content="Invalid signature", status_code=401)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return Response(content="Invalid JSON", status_code=400)
    if not isinstance(event, dict):
        return Response(content="Invalid JSON", status_code=400)

    # PLAIN_TOLERANCE_SECONDS is opt-in; unset (or 0) disables the replay check.
    try:
        tolerance = float(os.environ.get("PLAIN_TOLERANCE_SECONDS", "") or 0)
    except ValueError:
        tolerance = 0
    if tolerance > 0 and not is_timestamp_fresh(event, tolerance):
        return Response(content="Stale webhook timestamp", status_code=400)

    # The event type is in payload.eventType (also sent as the Plain-Event-Type header).
    # event["id"] is stable across retries: use it as the idempotency key.
    payload = event.get("payload") or {}
    event_type = payload.get("eventType")

    if event_type == "thread.thread_created":
        print("Thread created:", (payload.get("thread") or {}).get("id"))
    elif event_type == "thread.email_received":
        print("Email received on thread:", (payload.get("thread") or {}).get("id"))
    elif event_type == "thread.thread_status_transitioned":
        print("Thread status changed:", (payload.get("thread") or {}).get("id"))
    elif event_type == "customer.customer_created":
        print("Customer created:", (payload.get("customer") or {}).get("id"))
    else:
        print("Unhandled Plain event:", event_type)

    return {"received": True}
