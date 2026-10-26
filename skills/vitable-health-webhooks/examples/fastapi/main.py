# Generated with: vitable-health-webhooks skill
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

logger = logging.getLogger("vitable-health-webhooks")
app = FastAPI()

# Vitable Health signs every delivery with HMAC-SHA512:
#   X-Vitable-Signature: sha512=<128 hex characters>
#   X-Vitable-Timestamp: <unix_timestamp>
# signed content = "<X-Vitable-Timestamp value>.<raw body bytes>", key = the secret's UTF-8 bytes.
# https://developer.vitablehealth.com/webhooks/signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set VITABLE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in (Vitable's own
# examples use 300); any other value is treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "VITABLE_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

SIGNATURE_RE = re.compile(r"[0-9a-f]{128}")


def verify_vitable(raw_body: bytes, headers, secret: str) -> bool:
    if not secret:
        return False

    signature = headers.get("x-vitable-signature")
    timestamp = headers.get("x-vitable-timestamp")
    if not signature or not timestamp:
        return False

    # Accept the value with or without the sha512= prefix; hex is case-insensitive.
    # Validate the format (exact length and alphabet) before decoding.
    digest = signature.removeprefix("sha512=").lower()
    if not SIGNATURE_RE.fullmatch(digest):
        return False

    # Optional replay window; off unless VITABLE_WEBHOOK_TOLERANCE_SECONDS > 0
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(time.time() - int(timestamp)) > tolerance:
            return False

    # Build the signed message as bytes: header value as received (latin-1), ".", raw body.
    # The secret is used as-is: UTF-8 bytes, not hex- or base64-decoded.
    message = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)


# In-memory dedupe on event_id. Vitable delivers at-least-once; use a database or cache with a
# unique constraint in production.
seen_events: set[str] = set()


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("VITABLE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("VITABLE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # request.body() is the raw bytes whatever the content type is
    raw_body = await request.body()
    if not verify_vitable(raw_body, request.headers, secret):
        logger.error("Vitable Health webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/vitable-health")
async def vitable_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_id = event.get("event_id")
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}

    # Events are thin: {event_id, organization_id, event_name, resource_type, resource_id, created_at}.
    # Dispatch on event_name and fetch the resource from the Vitable API with resource_id.
    name = event.get("event_name")
    resource_id = event.get("resource_id")
    org = event.get("organization_id")

    if name == "enrollment.accepted":
        logger.info("Enrollment accepted: %s (org %s)", resource_id, org)
    elif name == "enrollment.terminated":
        logger.info("Enrollment terminated: %s (org %s)", resource_id, org)
    elif name == "employee.eligibility_granted":
        logger.info("Employee eligibility granted: %s (org %s)", resource_id, org)
    elif name == "employee.eligibility_terminated":
        logger.info("Employee eligibility terminated: %s (org %s)", resource_id, org)
    elif name == "employee.deduction_created":
        logger.info("Payroll deduction created: %s (org %s)", resource_id, org)
    else:
        # enrollment.elected, enrollment.granted, enrollment.waived, enrollment.started,
        # employee.deactivated, and any future event
        logger.info("Unhandled event: %s", name)

    if event_id:
        seen_events.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
