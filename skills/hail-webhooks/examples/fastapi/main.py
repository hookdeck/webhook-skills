# Generated with: hail-webhooks skill
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

logger = logging.getLogger("hail-webhooks")
app = FastAPI()

# Hail signs every delivery with an X-Hail-Signature header:
#   t=<unix>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the whole signing secret
# (including whsec_) as UTF-8. This is NOT Standard Webhooks: no svix / standardwebhooks library,
# no stripping or base64-decoding of the whsec_ prefix.
# https://hail.so/docs/webhooks

# Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
# original timestamp, so a window would reject late redeliveries (Hail re-signs its own retries).
# Set HAIL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("HAIL_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "HAIL_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=...,v1=...' -> (t, [v1, ...]). Parts are trimmed; every v1 is collected (Hail sends one;
    accepting any match is harmless)."""
    t, v1s = None, []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key = key.strip()
        if key == "t":
            t = value.strip()
        elif key == "v1":
            v1s.append(value.strip())
    return t, v1s


def verify_hail(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1s = parse_signature_header(signature_header)
    if not t or not v1s:
        return False

    # Opt-in only: off unless HAIL_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (t.isascii() and t.isdigit()):
            return False
        if abs(time.time() - int(t)) > tolerance:
            return False

    signed = t.encode() + b"." + raw_body
    # whole secret incl. whsec_, used as-is
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Accept if any v1 matches. compare_digest on bytes (encode both sides) so a non-ASCII
    # header value gives a 400, not a 500.
    return any(hmac.compare_digest(v.lower().encode(), expected) for v in v1s)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("HAIL_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("HAIL_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_hail(raw_body, request.headers.get("x-hail-signature"), secret):
        logger.error("Hail webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


CALL_EVENTS = {
    "call.received",
    "call.answered",
    "call.completed",
    "call.failed",
    "call.busy",
    "call.no_answer",
    "call.transferred",
}


@app.post("/webhooks/hail")
async def hail_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Dedupe on the X-Hail-Delivery header (stable across retries) or event["id"] before side effects.
    event_type = event.get("type")
    data = event.get("data") or {}
    detail = data.get("detail") or {}

    if event_type == "email.received":
        logger.info("Email received from %s: %s", data.get("from_address"), data.get("subject"))
    elif event_type == "email.received.suppressed":
        logger.info("Inbound email %s suppressed: %s", data.get("id"), data.get("reason"))
    elif event_type == "email.delivered":
        logger.info("Email %s delivered", data.get("id"))
    elif event_type == "email.delivery_delayed":
        logger.info("Email %s delivery delayed", data.get("id"))
    elif event_type == "email.bounced":
        logger.info("Email %s bounced (hard: %s)", data.get("id"), detail.get("hard"))
    elif event_type == "email.complained":
        logger.info("Email %s marked as spam", data.get("id"))
    elif event_type == "email.opened":
        logger.info("Email %s opened", data.get("id"))
    elif event_type == "email.clicked":
        logger.info("Email %s link clicked: %s", data.get("id"), detail.get("link"))
    elif event_type == "email.send_failed":
        logger.info("Email %s failed to send", data.get("id"))
    elif event_type == "sms.received":
        logger.info("SMS from %s: %s", data.get("from"), data.get("body"))
    elif event_type == "sms.delivered":
        logger.info("SMS %s delivered", data.get("id"))
    elif event_type == "sms.undelivered":
        logger.info("SMS %s undelivered", data.get("id"))
    elif event_type == "sms.failed":
        logger.info("SMS %s failed", data.get("id"))
    elif event_type in CALL_EVENTS:
        logger.info(
            "%s: call %s (%s) %s -> %s",
            event_type, data.get("id"), data.get("direction"), data.get("from"), data.get("to"),
        )
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
