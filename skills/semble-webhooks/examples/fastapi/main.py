# Generated with: semble-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("semble-webhooks")
app = FastAPI()

# Semble signs every delivery with an X-Webhook-Signature header:
#   t=<unix seconds>,v1=<lowercase hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook secret as a UTF-8 string.
# Semble's docs show one v1; accepting any matching v1 is a harmless defensive choice.
# X-Webhook-Timestamp repeats t, but the t inside X-Webhook-Signature is the one to sign with.
# https://docs.semble.io/docs/webhooks/guide/

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set SEMBLE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False
_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("SEMBLE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "SEMBLE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Split on ',', trim each part (a space after the comma is allowed), split at the first '='.
    Returns the timestamp and every v1 value."""
    t = None
    v1 = []
    for part in header.split(","):
        key, sep, value = part.strip().partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_semble(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1 or not (t.isascii() and t.isdigit()):
        return False

    # Semble's guide suggests rejecting timestamps older than 5 minutes. It's opt-in here: off unless
    # SEMBLE_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # secret used as a UTF-8 string, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()

    # Accept if any v1 matches. compare_digest runs on bytes, so a non-ASCII header value
    # gives a failed match (401/400), not a TypeError (500).
    return any(
        _HEX64.fullmatch(sig) is not None
        and hmac.compare_digest(sig.lower().encode(), expected.encode())
        for sig in v1
    )


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("SEMBLE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("SEMBLE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_semble(raw_body, request.headers.get("x-webhook-signature"), secret):
        logger.error("Semble webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/semble")
async def semble_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Body: { subscriptionId, eventId, eventType, identifiers, metadata? }
    event_type = event.get("eventType")
    ids = event.get("identifiers") or {}

    if event_type == "booking.created":
        logger.info("Booking %s created (patient %s)", ids.get("bookingId"), ids.get("patientId", "none"))
    elif event_type == "booking.updated":
        logger.info("Booking %s updated", ids.get("bookingId"))
    elif event_type == "booking.deleted":
        logger.info("Booking %s deleted", ids.get("bookingId"))
    elif event_type == "contact.created":
        logger.info("Contact %s created", ids.get("contactId"))
    elif event_type == "invoice.paid":
        logger.info("Invoice %s paid by payment %s", ids.get("invoiceId"), ids.get("paymentId"))
    elif event_type == "resourceAvailability.updated":
        logger.info("Availability rule %s updated", ids.get("resourceAvailabilityId"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
