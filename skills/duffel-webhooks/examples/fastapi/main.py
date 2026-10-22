# Generated with: duffel-webhooks skill
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

logger = logging.getLogger("duffel-webhooks")
app = FastAPI()

# Duffel signs every webhook:
#   X-Duffel-Signature: t=<unix seconds>,v1=<lowercase hex>
# v1 = HMAC-SHA256 of "<t>.<raw body>", keyed with the webhook secret string's bytes as-is
# (it looks base64 but is NOT decoded).
# https://duffel.com/docs/guides/receiving-webhooks

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set DUFFEL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("DUFFEL_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "DUFFEL_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str) -> dict:
    parts = {}
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_duffel(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    parts = parse_signature_header(signature_header)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1:
        return False
    try:
        ts = int(t)
    except ValueError:
        return False
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1.encode(), expected.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("DUFFEL_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("DUFFEL_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-duffel-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Duffel-Signature header")

    raw_body = await request.body()
    if not verify_duffel(raw_body, signature, secret):
        logger.error("Duffel webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/duffel")
async def duffel_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}

    # Retries can deliver duplicates: dedupe on event["idempotency_key"]
    if event_type == "ping.triggered":
        logger.info("Ping received")
    elif event_type == "order.created":
        logger.info("Order created: %s", obj.get("id"))
    elif event_type == "order.airline_initiated_change_detected":
        logger.info("Airline change detected on order: %s", obj.get("id"))
    elif event_type == "order_cancellation.confirmed":
        logger.info("Order cancellation confirmed: %s", obj.get("id"))
    elif event_type == "payment.succeeded":
        logger.info("Payment succeeded: %s", obj.get("id"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
