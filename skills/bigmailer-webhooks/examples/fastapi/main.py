# Generated with: bigmailer-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("bigmailer-webhooks")
app = FastAPI()

# BigMailer signs every event in X-BigMailer-Signature: "t=<unix seconds>,v1=<hex>"
# (more than one v1= entry can appear, e.g. during key rotation).
# Each v1 is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the endpoint's signing secret.
# https://docs.bigmailer.io/docs/verifying-webhook-signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set BIGMAILER_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("BIGMAILER_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "BIGMAILER_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=1492774578,v1=<hex>,v1=<hex>' -> ('1492774578', ['<hex>', '<hex>'])

    Only v1 is a valid scheme; any other key (v0, ...) is ignored.
    """
    timestamp = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    return timestamp, signatures


def verify_bigmailer(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not signatures:
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance:
            return False

    # The signed message is the t string exactly as sent, ".", then the raw body bytes.
    # The key is the secret's UTF-8 bytes, used as-is.
    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    for sig in signatures:
        # Exactly 64 hex characters, compared case-insensitively
        if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
            continue
        if hmac.compare_digest(sig.lower().encode(), expected):
            return True
    return False


async def verified_body(request: Request) -> bytes:
    """Read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("BIGMAILER_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BIGMAILER_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_bigmailer(raw_body, request.headers.get("x-bigmailer-signature"), secret):
        logger.error("BigMailer webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/bigmailer")
async def bigmailer_webhook(request: Request):
    raw_body = await verified_body(request)

    # Verified, but still untrusted: check every type before reading into it.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = payload.get("type")
    if not isinstance(event_type, str):
        event_type = None
    # The event data sits under a key named after the type (bounce, click, ...)
    data = payload.get(event_type) if event_type else None
    if not isinstance(data, dict):
        data = {}

    if event_type == "bounce":
        # data["type"] is the bounce kind (hard / soft), not the event type
        logger.info("Bounce (%s) for %s on campaign %s", data.get("type"), data.get("email"), data.get("campaign_id"))
    elif event_type == "click":
        logger.info("Click by %s on %s", data.get("email"), data.get("url"))
    elif event_type == "complaint":
        logger.info("Complaint from %s", data.get("email"))
    elif event_type == "open":
        logger.info("Open by %s", data.get("email"))
    elif event_type == "unsubscribe":
        ids = data.get("unsubscribe_ids")
        lists = len(ids) if isinstance(ids, list) else 0
        logger.info(
            "Unsubscribe by %s (all: %s, %d lists)", data.get("email"), data.get("unsubscribe_all") is True, lists
        )
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
