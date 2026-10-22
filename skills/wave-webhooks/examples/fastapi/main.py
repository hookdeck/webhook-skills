# Generated with: wave-webhooks skill
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

logger = logging.getLogger("wave-webhooks")
app = FastAPI()

# Wave sends two headers on every webhook:
# - x-wave-signature: "t=<unix seconds>,v1=<hex>", where v1 is HMAC-SHA256 of
#   "<t>.<raw body>" keyed with the webhook secret (UTF-8)
# - x-wave-timestamp: the same timestamp as a string (unsigned, so verification uses t)
# https://developer.waveapps.com/hc/en-us/articles/51070420388628-Webhooks-Setup-Guide

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set WAVE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("WAVE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "WAVE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
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


def verify_wave(raw_body: bytes, headers, secret: str) -> bool:
    if not secret:
        return False

    signature_header = headers.get("x-wave-signature")
    if not signature_header:
        return False

    parts = parse_signature_header(signature_header)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1:
        return False
    try:
        ts = int(t)
    except ValueError:
        return False
    # Wave recommends a 5-minute window. It's opt-in here: off unless
    # WAVE_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1.lower().encode(), expected.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body (any content type) and verify it before any JSON parsing."""
    secret = os.getenv("WAVE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("WAVE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_wave(raw_body, request.headers, secret):
        logger.error("Wave webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/wave")
async def wave_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event_type")
    data = payload.get("data") or {}

    if event == "invoice.sent":
        logger.info("Invoice %s sent to customer %s", data.get("invoice_id"), data.get("customer_id"))
    elif event == "invoice.viewed":
        logger.info("Invoice %s viewed", data.get("invoice_id"))
    elif event == "invoice.paid":
        logger.info("Invoice %s paid: %s %s", data.get("invoice_id"), data.get("amount_paid"), data.get("currency_code"))
    elif event == "invoice.partially_paid":
        logger.info("Invoice %s partially paid, remaining %s", data.get("invoice_id"), data.get("remaining_balance"))
    elif event == "invoice.overdue":
        logger.info("Invoice %s overdue, balance %s", data.get("invoice_id"), data.get("invoice_balance"))
    elif event == "invoice.approved":
        logger.info("Invoice %s approved", data.get("invoice_id"))
    elif event == "estimate.sent":
        logger.info("Estimate %s sent", data.get("estimate_id"))
    elif event == "estimate.accepted":
        logger.info("Estimate %s accepted", data.get("estimate_id"))
    elif event == "checkout.paid":
        logger.info("Checkout %s paid: %s %s", data.get("checkout_id"), data.get("amount"), data.get("currency_code"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
