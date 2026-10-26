# Generated with: pennylane-webhooks skill
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

logger = logging.getLogger("pennylane-webhooks")
app = FastAPI()

# Pennylane signs every delivery with an X-Pennylane-Signature header:
#   t=<unix seconds>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the subscription secret as-is.
# Pennylane's docs show one v1; accepting any matching v1 is a harmless defensive choice.
# https://pennylane.readme.io/docs/authorization

# Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
# original timestamp, so a window would reject late redeliveries.
# Set PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Split on ',', trim each part (a space after the comma is allowed), keep t and every v1."""
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


def verify_pennylane(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1:
        return False

    # Pennylane suggests rejecting timestamps older than 5 minutes. It's opt-in here: off unless
    # PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (t.isascii() and t.isdigit()):
            return False
        if abs(time.time() - int(t)) > tolerance:
            return False

    signed = t.encode() + b"." + raw_body
    # subscription secret used as-is, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # compare_digest on bytes: a non-ASCII header value gives a mismatch, not a TypeError
    return any(hmac.compare_digest(v.lower().encode(), expected) for v in v1)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("PENNYLANE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("PENNYLANE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    # 400, not 401/403/404/410: Pennylane disables the subscription at once on those four
    if not verify_pennylane(raw_body, request.headers.get("x-pennylane-signature"), secret):
        logger.error("Pennylane webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/pennylane")
async def pennylane_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # payload["id"] is the delivery id: deduplicate on it (deliveries are at-least-once and unordered)
    data = payload.get("data") or {}
    obj = data.get("object") or {}
    company_id = (data.get("context") or {}).get("company_id")
    event = payload.get("event")

    if event == "customer_invoice.e_invoicing_status_updated":
        previous = ((data.get("previous_attributes") or {}).get("e_invoicing") or {}).get("status")
        logger.info(
            "Customer invoice %s (company %s) e-invoicing status: %s -> %s",
            obj.get("id"), company_id, previous or "none", (obj.get("e_invoicing") or {}).get("status"),
        )
    elif event == "dms_file.created":
        logger.info("DMS file %s created (company %s)", obj.get("id"), company_id)
    elif event == "supplier_invoice.e_invoicing_received":
        logger.info("Supplier invoice %s received via e-invoicing (company %s)", obj.get("id"), company_id)
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
