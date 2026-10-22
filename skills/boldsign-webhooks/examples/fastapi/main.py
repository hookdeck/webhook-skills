# Generated with: boldsign-webhooks skill
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
from fastapi.responses import PlainTextResponse

load_dotenv()

logger = logging.getLogger("boldsign-webhooks")
app = FastAPI()

# BoldSign signs every event in X-BoldSign-Signature: "t=<unix seconds>, s0=<hex>"
# (plus ", s1=<hex>" from the old key while a secret rollover is in progress).
# Each signature is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the webhook signing secret.
# https://developers.boldsign.com/webhooks/verify-webhook-events/

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=1668693823, s0=<hex>, s1=<hex>' -> ('1668693823', ['<hex>', '<hex>'])"""
    timestamp = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            timestamp = value
        elif key in ("s0", "s1"):
            signatures.append(value)
    return timestamp, signatures


def verify_boldsign(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not re.fullmatch(r"[0-9]+", timestamp) or not signatures:
        return False

    # BoldSign suggests a short window (e.g. 5 minutes). It's opt-in here: off unless
    # BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        return False

    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    # s0 is the current key; s1 (old key) is only present during a rollover. Accept either.
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in signatures)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("BOLDSIGN_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BOLDSIGN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_boldsign(raw_body, request.headers.get("x-boldsign-signature"), secret):
        logger.error("BoldSign webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/boldsign")
async def boldsign_webhook(request: Request):
    # Setup sends a "Verification" POST that must get a 200 within 10 seconds
    if request.headers.get("x-boldsign-event") == "Verification":
        return PlainTextResponse("OK")

    raw_body = await verified_body(request)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = (payload.get("event") or {}).get("eventType")
    doc = payload.get("data") or {}

    if event_type == "Verification":
        logger.info("Verification event received")
    elif event_type in ("Sent", "Viewed", "Signed"):
        logger.info("Document %s (%s): %s", doc.get("documentId"), event_type, doc.get("messageTitle"))
    elif event_type == "Completed":
        logger.info("Document %s completed by all signers", doc.get("documentId"))
    elif event_type == "Declined":
        logger.info("Document %s declined", doc.get("documentId"))
    elif event_type in ("Revoked", "Expired"):
        logger.info("Document %s %s", doc.get("documentId"), event_type.lower())
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
