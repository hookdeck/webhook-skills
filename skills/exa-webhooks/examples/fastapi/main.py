# Generated with: exa-webhooks skill
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

logger = logging.getLogger("exa-webhooks")
app = FastAPI()

# Exa-Signature: "t=<unix seconds>,v1=<hex>[,v1=<hex>...]"
# v1 = HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook secret (UTF-8 string).
# https://docs.exa.ai/websets/api/webhooks/verifying-signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set EXA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("EXA_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "EXA_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """Return (timestamp, [v1 signatures]). Several v1 values may be present."""
    timestamp = None
    signatures = []
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    return timestamp, signatures


def verify_exa(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not signatures:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in signatures)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("EXA_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("EXA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature_header = request.headers.get("exa-signature")
    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing Exa-Signature header")

    raw_body = await request.body()
    if not verify_exa(raw_body, signature_header, secret):
        logger.error("Exa webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/exa")
async def exa_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Exa events: { id, object: "event", type, data, createdAt }
    event_type = event.get("type")
    data_id = (event.get("data") or {}).get("id")

    if event_type == "webset.created":
        logger.info("Webset created: %s", data_id)
    elif event_type == "webset.idle":
        logger.info("Webset idle: %s", data_id)
    elif event_type == "webset.search.completed":
        logger.info("Search completed: %s", data_id)
    elif event_type == "webset.item.created":
        logger.info("Item created: %s", data_id)
    elif event_type == "webset.item.enriched":
        logger.info("Item enriched: %s", data_id)
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
