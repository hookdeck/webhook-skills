# Generated with: mercury-webhooks skill
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

logger = logging.getLogger("mercury-webhooks")
app = FastAPI()

# Mercury signs every delivery with a Mercury-Signature header:
#   t=<unix seconds>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the endpoint's secretKey as-is.
# https://docs.mercury.com/reference/webhooks#verifying-webhook-signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set MERCURY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MERCURY_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MERCURY_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
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


def verify_mercury(raw_body: bytes, signature_header, secret: str) -> bool:
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
    # Mercury recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
    # MERCURY_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # secretKey used as-is, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1.encode(), expected.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("MERCURY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("MERCURY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_mercury(raw_body, request.headers.get("mercury-signature"), secret):
        logger.error("Mercury webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


BALANCE_RESOURCES = {
    "checkingAccount",
    "savingsAccount",
    "treasuryAccount",
    "creditAccount",
    "investmentAccount",
}


@app.post("/webhooks/mercury")
async def mercury_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The eventTypes you subscribe to (transaction.created, ...) are not in the body.
    # The body carries resourceType + operationType ("create" | "update" | "delete").
    resource_type = event.get("resourceType")
    key = f"{resource_type}.{event.get('operationType')}"
    changed = ", ".join(event.get("changedPaths") or [])

    if key == "transaction.create":
        logger.info("Transaction %s created: %s", event.get("resourceId"), (event.get("mergePatch") or {}).get("status"))
    elif key == "transaction.update":
        logger.info("Transaction %s updated: %s", event.get("resourceId"), changed)
    elif resource_type in BALANCE_RESOURCES and event.get("operationType") == "update":
        logger.info("%s %s balance updated: %s", resource_type, event.get("resourceId"), changed)
    else:
        logger.info("Unhandled event: %s", key)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
