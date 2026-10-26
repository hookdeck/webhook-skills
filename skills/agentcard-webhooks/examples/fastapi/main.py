# Generated with: agentcard-webhooks skill
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

logger = logging.getLogger("agentcard-webhooks")
app = FastAPI()

# Agentcard signs every delivery with an AgentCard-Signature header:
#   t=<unix seconds>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>". The key is the endpoint's WHOLE secret string,
# including the whsec_ prefix, as UTF-8. This is NOT Standard Webhooks: don't strip the prefix or
# base64-decode it, and don't use the standardwebhooks or svix libraries.
# The legacy X-AgentCard-Signature (sha256=<hex>, body only) header is not used here.
# https://docs.agentcard.com/webhooks/overview

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

_TS_RE = re.compile(r"[0-9]+", re.ASCII)


def parse_signature_header(header: str):
    """Split on ',', trim each part, split on the first '='. Keep every v1 (defensive; the docs show one)."""
    t = None
    v1 = []
    for part in header.split(","):
        key, sep, value = part.strip().partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_agentcard(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1 or not _TS_RE.fullmatch(t):
        return False

    # Opt-in only: off unless AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    signed = t.encode() + b"." + raw_body
    # whole secret string incl. whsec_, UTF-8, not decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # compare_digest on bytes: a non-ASCII header value gives a mismatch (401/400), not a 500
    return any(hmac.compare_digest(sig.lower().encode(), expected) for sig in v1)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("AGENTCARD_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("AGENTCARD_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_agentcard(raw_body, request.headers.get("agentcard-signature"), secret):
        logger.error("Agentcard webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/agentcard")
async def agentcard_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {id, type, created, livemode, data}. Delivery is at least once: dedupe on event["id"].
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "card.created":
        logger.info("Card %s created (**** %s), balance %s cents", data.get("id"), data.get("last4"), data.get("balance_cents"))
    elif event_type == "card.updated":
        logger.info("Card %s updated: status %s, balance %s cents", data.get("id"), data.get("status"), data.get("balance_cents"))
    elif event_type == "card.closed":
        logger.info("Card %s closed", data.get("id"))
    elif event_type == "transaction.authorized":
        logger.info("Transaction %s authorized on card %s: %s at %s", data.get("id"), data.get("card_id"), data.get("amount_display"), data.get("merchant"))
    elif event_type == "approval.requested":
        logger.info("Approval %s requested: %s (expires %s)", data.get("approval_id"), data.get("action"), data.get("expires_at"))
    elif event_type == "checkout_authorization.approved":
        logger.info("Checkout authorization %s approved: %s at %s", data.get("authorization_id"), data.get("amount_display"), data.get("merchant"))
    elif event_type == "balance.low":
        logger.info("Card %s balance low: %s cents", data.get("card_id"), data.get("balance_cents"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
