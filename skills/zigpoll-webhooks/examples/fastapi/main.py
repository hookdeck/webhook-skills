# Generated with: zigpoll-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("zigpoll-webhooks")
app = FastAPI()

# Zigpoll signs every delivery with an X-Zigpoll-Signature header:
#   t=<unix milliseconds>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the account-wide Signing Secret.
# https://docs.zigpoll.com/integrations/webhooks

# Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
# original timestamp (Zigpoll's own retries are re-signed with a fresh one), so a window would
# reject late redeliveries. Set ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to
# opt in; any other value is treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Split on ',' and trim each part. Every v1 is kept (Zigpoll sends one; accepting any match is harmless)."""
    t = None
    v1 = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_zigpoll(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1 or not (t.isascii() and t.isdigit()):
        return False

    # t is in milliseconds. The window is opt-in: off unless ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t) / 1000) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Accept if any v1 matches. Encode both sides to bytes so a non-ASCII header gives a clean
    # rejection (str arguments to compare_digest raise TypeError on non-ASCII).
    ok = False
    for candidate in v1:
        if hmac.compare_digest(candidate.lower().encode(), expected):
            ok = True
    return ok


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("ZIGPOLL_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("ZIGPOLL_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_zigpoll(raw_body, request.headers.get("x-zigpoll-signature"), secret):
        logger.error("Zigpoll webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/zigpoll")
async def zigpoll_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Delivery is at-least-once: dedupe on X-Zigpoll-Delivery-Id (same across every attempt).
    delivery_id = request.headers.get("x-zigpoll-delivery-id")
    event_type = event.get("type")

    if event_type == "submitted-responses":
        # Fires on every submission, even if the respondent stops partway
        logger.info("Responses submitted for poll %s (complete: %s) [%s]",
                    event.get("pollId"), event.get("submissionsComplete"), delivery_id)
    elif event_type == "completed-survey":
        # Fires once the respondent reaches the end of the survey
        logger.info("Survey completed for poll %s by participant %s [%s]",
                    event.get("pollId"), event.get("participantId"), delivery_id)
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
