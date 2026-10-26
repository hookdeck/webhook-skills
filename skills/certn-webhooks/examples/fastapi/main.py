# Generated with: certn-webhooks skill
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

logger = logging.getLogger("certn-webhooks")
app = FastAPI()

# When signing is enabled, Certn adds a Certn-Signature header to every delivery (one line):
#   t=<unix seconds>, v1=<hex>[, v1=<hex>]
# Each v1 is HMAC-SHA256 (hex) of "<t>.<request body as text>", keyed with the signing secret as UTF-8.
# Several v1 values are sent while a rolled secret is still active (48 hours).
# https://docs.certn.co/api/guides/use-the-api/webhooks

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set CERTN_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("CERTN_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "CERTN_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Split on ',' and trim each part; keep t and every v1, ignore other schemes."""
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


def verify_certn(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1:
        return False
    if not (t.isascii() and t.isdigit()):
        return False
    # Certn suggests rejecting old timestamps. It's opt-in here: off unless
    # CERTN_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # signing secret as UTF-8, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Accept if any v1 matches. compare_digest on bytes (not str) so a non-ASCII header
    # value is a failed match (400), not a TypeError (500).
    return any(hmac.compare_digest(sig.lower().encode(), expected) for sig in v1)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("CERTN_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("CERTN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_certn(raw_body, request.headers.get("certn-signature"), secret):
        logger.error("Certn webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/certn")
async def certn_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        applicant = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Certn has no event types: the body is the applicant (report) object, posted as results
    # become available. Dispatch on report_status (for example IN_PROGRESS or COMPLETE).
    status = applicant.get("report_status") if isinstance(applicant, dict) else None
    if status == "COMPLETE":
        logger.info("Applicant %s report complete: result %s", applicant.get("id"), applicant.get("result"))
    elif status == "IN_PROGRESS":
        logger.info("Applicant %s report in progress", applicant.get("id"))
    else:
        logger.info("Unhandled report_status: %s", status)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
