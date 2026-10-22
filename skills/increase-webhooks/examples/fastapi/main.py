# Generated with: increase-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("increase-webhooks")
app = FastAPI()

# Increase uses the Standard Webhooks headers and signed content, but NOT the Standard Webhooks
# key format: the Event Subscription's shared_secret is the HMAC key as raw UTF-8 bytes
# (no whsec_ prefix, no base64 decoding), so the standardwebhooks library can't be used as-is.
#   webhook-id:        the Event ID
#   webhook-timestamp: unix seconds
#   webhook-signature: "v1,<base64 HMAC-SHA256 of '<id>.<timestamp>.<raw body>'>", space-separated
#                      when more than one secret is active
# https://increase.com/documentation/webhooks#securing-your-webhook-endpoint-recommended

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set INCREASE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("INCREASE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "INCREASE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_increase(raw_body: bytes, headers, secret: str) -> bool:
    if not secret:
        return False

    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not webhook_id or not timestamp or not signature_header:
        return False

    try:
        ts = int(timestamp)
    except ValueError:
        return False
    # Increase suggests a 5-minute window. It's opt-in here: off unless
    # INCREASE_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    # The secret is used as-is: raw UTF-8 bytes, not base64-decoded
    signed = f"{webhook_id}.{timestamp}.".encode() + raw_body
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    expected = "v1," + base64.b64encode(digest).decode()
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in signature_header.split(" "))


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("INCREASE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("INCREASE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # request.body() is the raw bytes whatever the content type is
    raw_body = await request.body()
    if not verify_increase(raw_body, request.headers, secret):
        logger.error("Increase webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/increase")
async def increase_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Events are thin: {id, category, associated_object_type, associated_object_id, created_at, type}.
    # Dispatch on category and GET the object from the API if you need its fields.
    # webhook-id (the Event ID) is a good idempotency key: Increase retries failed deliveries.
    category = event.get("category") if isinstance(event, dict) else None
    object_id = event.get("associated_object_id") if isinstance(event, dict) else None

    if category == "transaction.created":
        logger.info("Transaction created: %s", object_id)
    elif category == "pending_transaction.created":
        logger.info("Pending transaction created: %s", object_id)
    elif category == "account.created":
        logger.info("Account created: %s", object_id)
    elif category in ("ach_transfer.created", "ach_transfer.updated"):
        logger.info("ACH transfer %s (%s)", object_id, category)
    elif category == "card_payment.created":
        logger.info("Card payment created: %s", object_id)
    else:
        logger.info("Unhandled event category: %s", category)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
