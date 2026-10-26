# Generated with: moneybird-webhooks skill
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

logger = logging.getLogger("moneybird-webhooks")
app = FastAPI()

# Moneybird signs every delivery with a Moneybird-Signature header:
#   t=<unix seconds>,v1=<hex>            (one v1 per active secret during a rotation)
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook's secret as-is.
# https://developer.moneybird.com/webhooks/verifying-signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

HEX_DIGEST = re.compile(r"[0-9a-f]{64}", re.IGNORECASE)


def parse_signature_header(header: str):
    """Split on ',', trim each part (a space after the comma is allowed), keep t and every v1.

    Other schemes are ignored, as Moneybird asks.
    """
    t = None
    v1 = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_moneybird(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1 or not (t.isascii() and t.isdigit()):
        return False
    # Moneybird recommends rejecting timestamps more than 5 minutes away. It's opt-in here: off
    # unless MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # secret used as-is, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Accept if any v1 matches (several are sent while a secret is being rotated).
    # compare_digest on bytes, so a non-ASCII header value is a 400, not a TypeError/500.
    matched = False
    for digest in v1:
        if HEX_DIGEST.fullmatch(digest) and hmac.compare_digest(digest.lower().encode(), expected):
            matched = True
    return matched


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("MONEYBIRD_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("MONEYBIRD_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_moneybird(raw_body, request.headers.get("moneybird-signature"), secret):
        logger.error("Moneybird webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/moneybird")
async def moneybird_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Idempotency-Key is unique per push; use it to skip a push you already processed.
    # `action` names the event; `entity` is the same JSON the API returns for that record.
    action = event.get("action")
    entity_id = event.get("entity_id")
    entity = event.get("entity") or {}

    if action == "sales_invoice_created":
        logger.info("Sales invoice %s created (%s)", entity_id, event.get("state"))
    elif action == "sales_invoice_state_changed_to_paid":
        logger.info("Sales invoice %s paid", entity_id)
    elif action == "sales_invoice_state_changed_to_late":
        logger.info("Sales invoice %s is late", entity_id)
    elif action == "contact_created":
        logger.info("Contact %s created: %s", entity_id, entity.get("company_name") or entity.get("lastname") or "")
    elif action == "contact_changed":
        logger.info("Contact %s updated", entity_id)
    elif action == "payment_registered":
        logger.info("Payment %s registered", entity_id)
    else:
        logger.info("Unhandled action: %s", action)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
