# Generated with: nooks-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("nooks-webhooks")
app = FastAPI()

# Nooks signs every delivery after activation with an x-webhook-signature header:
#   t=<unix milliseconds>,s=<base64>
# s is the base64 HMAC-SHA256 of "<t>.<raw body>" (t exactly as sent), keyed with the signing key
# as a UTF-8 string.
# https://nooks.help.usepylon.com/articles/8109690071-nooks-webhooks-integration-guide

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set NOOKS_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("NOOKS_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "NOOKS_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


# Split on ',' then on the FIRST '=' only: base64 signatures end in '='.
def parse_signature_header(header: str) -> dict:
    parts = {}
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_nooks(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    parts = parse_signature_header(signature_header)
    t, s = parts.get("t"), parts.get("s")
    if not t or not s or not (t.isascii() and t.isdigit()):
        return False

    # Nooks recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
    # NOOKS_TIMESTAMP_TOLERANCE_SECONDS > 0. t is in milliseconds.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() * 1000 - int(t)) / 1000 > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # signing key used as-is, as UTF-8
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Bytes on both sides: a non-ASCII header is a failed match (401), not a TypeError (500)
    return hmac.compare_digest(s.encode("utf-8"), expected)


@app.post("/webhooks/nooks")
async def nooks_webhook(request: Request):
    # Raw body: read the bytes before any JSON parsing, whatever the Content-Type is
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature")

    # The one-time activation ping Nooks sends when you save the URL may be unsigned, and it must get
    # a 2xx. Unsigned requests are rejected unless NOOKS_ACCEPT_UNSIGNED_PING=true, which you set only
    # while activating a URL that points straight at this app (no signing key exists yet). Even then
    # they are acknowledged, never processed.
    if not signature:
        if os.getenv("NOOKS_ACCEPT_UNSIGNED_PING") == "true":
            logger.info("Unsigned request acknowledged (activation ping); not processed")
            return {"received": True}
        raise HTTPException(status_code=401, detail="Missing x-webhook-signature header")

    secret = os.getenv("NOOKS_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("NOOKS_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not verify_nooks(raw_body, signature, secret):
        logger.error("Nooks webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event") if isinstance(event, dict) else None
    if event_type == "call.logged":
        # De-duplicate on callData.callId (stable across retries), never on eventId (one per attempt)
        call = event.get("callData") or {}
        logger.info(
            "Call %s logged: %s, disposition %s",
            call.get("callId"),
            call.get("status"),
            (call.get("disposition") or {}).get("name"),
        )
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
