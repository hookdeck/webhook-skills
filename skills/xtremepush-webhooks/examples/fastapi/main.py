# Generated with: xtremepush-webhooks skill
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

logger = logging.getLogger("xtremepush-webhooks")
app = FastAPI()

# With the Signed Payload auth type, Xtremepush adds an X-Xtremepush-Signature header:
#   t=<unix seconds>, v1=<hex>[, v1=<hex>]
# Each v1 is HMAC-SHA256 (hex) of "<t>.<JSON body>", keyed with the Webhook Secret Key as UTF-8.
# A second v1 appears for up to 24 hours after the key is replaced.
# https://docs.xtremepush.com/docs/verify-webhook-signatures

# The docs don't name the HTTP method, so every common method is accepted (signature checked first).
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

HEX64 = re.compile(rb"[0-9a-fA-F]{64}")

# Optional replay window in seconds. Off by default (unset or 0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Split on ',' and trim each part; keep t as the exact string and every v1, ignore other keys."""
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


def verify_xtremepush(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1:
        return False

    # Opt-in replay window: off unless XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (t.isascii() and t.isdigit()):
            return False
        if abs(time.time() - int(t)) > tolerance:
            return False

    # t exactly as it appears in the header, then ".", then the exact request bytes
    signed = t.encode() + b"." + raw_body
    # Webhook Secret Key as UTF-8, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Accept if any v1 matches. Check it is exactly 64 hex chars first, then compare_digest on
    # bytes (not str) so a non-ASCII header value is a failed match (401), not a TypeError (500).
    for sig in v1:
        candidate = sig.lower().encode()
        if HEX64.fullmatch(candidate) and hmac.compare_digest(candidate, expected):
            return True
    return False


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it, for every method, before any JSON parsing."""
    secret = os.getenv("XTREMEPUSH_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("XTREMEPUSH_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes whatever the Content-Type is; a request with no body gives b"" and is verified as such.
    raw_body = await request.body()
    if not verify_xtremepush(raw_body, request.headers.get("x-xtremepush-signature"), secret):
        logger.error("Xtremepush webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


def handle_event(payload) -> None:
    # The body is untrusted even after the signature check: confirm each type before reading into it.
    if not isinstance(payload, dict):
        logger.info("Ignoring Xtremepush body that is not a JSON object")
        return
    event = payload.get("event")
    if not isinstance(event, str):
        event = None
    properties = payload.get("properties")
    if not isinstance(properties, dict):
        properties = {}

    # A connection's "Custom format" can rename or drop `event`; the default body is event/time/properties.
    if event == "message_send":
        logger.info("Xtremepush message_send event %s", list(properties))
        # TODO: record that the campaign message was sent to this recipient
    elif event == "message_delivery":
        logger.info("Xtremepush message_delivery event %s", list(properties))
        # TODO: record that the campaign message was delivered
    else:
        logger.info("Unhandled Xtremepush event: %s", event)


@app.api_route("/webhooks/xtremepush", methods=ALLOWED_METHODS)
async def xtremepush_webhook(raw_body: bytes = Depends(verified_body)):
    # A verified request with no body is acknowledged, not rejected as invalid JSON.
    if raw_body:
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON")
        handle_event(payload)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
