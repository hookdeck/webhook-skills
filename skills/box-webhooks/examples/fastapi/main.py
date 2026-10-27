# Generated with: box-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("box-webhooks")
app = FastAPI()

# Box V2 webhooks send BOX-SIGNATURE-PRIMARY (and BOX-SIGNATURE-SECONDARY): standard padded base64
# HMAC-SHA256 of the raw request body followed by the BOX-DELIVERY-TIMESTAMP header value, with
# no separator, keyed with the signature key. Only the primary signature is verified here.
# https://developer.box.com/guides/webhooks/v2/signatures-v2/

# 44 characters: 43 base64 characters plus one "=" pad (a 32-byte digest)
BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=")

# Optional replay window in seconds. Off by default (0 or unset): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set BOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in (Box suggests 600);
# any other value is treated as 0, with a warning.
_warned_invalid_tolerance = False


def tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("BOX_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "BOX_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


tolerance_seconds()  # surface an invalid value at startup


def parse_rfc3339(value: str):
    """BOX-DELIVERY-TIMESTAMP is an RFC 3339 date, e.g. 2016-07-11T10:10:32-07:00 or ...Z"""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def verify_box(raw_body: bytes, signature, timestamp, secret: str) -> bool:
    if not secret or not signature or not timestamp:
        return False
    if not BASE64_SHA256.fullmatch(signature):
        return False
    try:
        base64.b64decode(signature, validate=True)
    except (binascii.Error, ValueError):
        return False

    # Opt-in only
    tolerance = tolerance_seconds()
    if tolerance > 0:
        sent = parse_rfc3339(timestamp)
        if sent is None or abs((datetime.now(timezone.utc) - sent).total_seconds()) > tolerance:
            return False

    # Signed message as bytes: raw body, then the timestamp header exactly as received (latin-1)
    signed = b"".join([raw_body, timestamp.encode("latin-1")])
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(signature.encode("ascii"), expected)


# Box's docs don't name the HTTP method (Hookdeck pre-selects POST, unmanaged), so every method is
# verified the same way.
@app.api_route("/webhooks/box", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def box_webhook(request: Request):
    secret = os.getenv("BOX_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BOX_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: read before any JSON parsing. A request without a body gives b"".
    raw_body = await request.body()
    if not verify_box(
        raw_body,
        request.headers.get("box-signature-primary"),
        request.headers.get("box-delivery-timestamp"),
        secret,
    ):
        logger.error("Box webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Hookdeck leaves the method unmanaged, so a verified request may arrive without a body
    if not raw_body:
        return {"received": True}

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # event["id"] is stable across Box retries (BOX-DELIVERY-ID changes per retry): use it to dedupe
    trigger = event.get("trigger")
    event_id = event.get("id")
    source = event.get("source") or {}

    if trigger in ("FILE.UPLOADED", "FILE.DOWNLOADED", "FILE.TRASHED"):
        logger.info('%s: file %s "%s" (event %s)', trigger, source.get("id"), source.get("name"), event_id)
    elif trigger == "FOLDER.CREATED":
        logger.info('%s: folder %s "%s" (event %s)', trigger, source.get("id"), source.get("name"), event_id)
    elif trigger == "COMMENT.CREATED":
        logger.info("%s: comment %s (event %s)", trigger, source.get("id"), event_id)
    elif trigger == "COLLABORATION.CREATED":
        logger.info("%s: collaboration %s (event %s)", trigger, source.get("id"), event_id)
    elif trigger == "SIGN_REQUEST.COMPLETED":
        logger.info("%s: sign request %s completed (event %s)", trigger, source.get("id"), event_id)
    else:
        logger.info("Unhandled trigger: %s", trigger)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
