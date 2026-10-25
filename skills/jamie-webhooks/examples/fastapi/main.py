# Generated with: jamie-webhooks skill
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

logger = logging.getLogger("jamie-webhooks")
app = FastAPI()

# Jamie signs every webhook created with "Signature Verification":
#   x-jamie-signature: t=<unix seconds>,v0=<lowercase hex>
# v0 = HMAC-SHA256 of "<t>.<raw body>", keyed with the signing secret string's UTF-8 bytes as-is.
# https://docs.meetjamie.ai/developers/webhooks/security-verification

# Optional replay window in seconds, off by default (0). Jamie's docs recommend rejecting
# timestamps older than 5 minutes (300) when Jamie calls you directly; set
# JAMIE_TIMESTAMP_TOLERANCE_SECONDS=300 to opt in. Behind Hookdeck leave it at 0: Hookdeck
# retries and replays resend the original timestamp, so a window rejects late redeliveries.
# An invalid value leaves the check off, with a warning.
DEFAULT_TOLERANCE_SECONDS = 0
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("JAMIE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_TOLERANCE_SECONDS
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "JAMIE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; "
                "the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return DEFAULT_TOLERANCE_SECONDS
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=123,v0=abc' -> ('123', ['abc']); accepts any number of v0 entries."""
    t, v0 = None, []
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            t = value
        elif key == "v0":
            v0.append(value)
    return t, v0


def verify_jamie(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v0 = parse_signature_header(signature_header)
    if not t or not v0 or not re.fullmatch(r"[0-9]+", t):
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # compare_digest handles unequal lengths by returning False
    return any(hmac.compare_digest(sig.encode(), expected) for sig in v0)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("JAMIE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("JAMIE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-jamie-signature")
    raw_body = await request.body()
    if not signature or not verify_jamie(raw_body, signature, secret):
        logger.error("Jamie webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")
    return raw_body


@app.post("/webhooks/jamie")
async def jamie_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in metadata.event (and the jamie-event header).
    # Dedupe on metadata.id / the jamie-delivery header: retries can deliver duplicates.
    event_type = (event.get("metadata") or {}).get("event") or request.headers.get("jamie-event")
    data = event.get("data") or {}

    if event_type == "meeting.completed":
        logger.info("Meeting completed: %s", data.get("title"))
        logger.info("Summary: %s", (data.get("summary") or {}).get("short"))
        logger.info("Tasks: %d", len(data.get("tasks") or []))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
