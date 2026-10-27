# Generated with: affonso-webhooks skill
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

logger = logging.getLogger("affonso-webhooks")
app = FastAPI()

# Affonso signs every webhook with two headers:
#   X-Affonso-Timestamp: Unix seconds
#   X-Affonso-Signature: lowercase hex HMAC-SHA256 of "<X-Affonso-Timestamp>.<raw body>", no prefix
# The key is the endpoint's 64-character hex signing secret used as a plain string (not hex-decoded).
# https://docs.affonso.io/webhooks/setup#verifying-webhook-signatures

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set AFFONSO_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("AFFONSO_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "AFFONSO_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


tolerance_seconds()  # surface an invalid value at startup


def verify_affonso(raw_body: bytes, timestamp_header, signature_header, secret: str) -> bool:
    if not secret or not timestamp_header or not signature_header:
        return False
    # Exactly 64 hex characters; check before decoding
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False

    # Affonso's docs show a 5 minute window. It's opt-in here: off unless the tolerance is > 0.
    tolerance = tolerance_seconds()
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", timestamp_header):
            return False
        if abs(time.time() - int(timestamp_header)) > tolerance:
            return False

    # Signed bytes: header value (latin-1) + "." + the raw body bytes, never a decoded string
    try:
        signed = b"".join([timestamp_header.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    received = bytes.fromhex(signature_header)  # safe: validated above
    return hmac.compare_digest(received, expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("AFFONSO_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("AFFONSO_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_affonso(
        raw_body,
        request.headers.get("x-affonso-timestamp"),
        request.headers.get("x-affonso-signature"),
        secret,
    ):
        logger.error("Affonso webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/affonso")
async def affonso_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type in ("affiliate.created", "affiliate.confirmed"):
        logger.info("Affiliate %s (%s): %s, status %s", data.get("affiliateId"), event_type, data.get("email"), data.get("status"))
    elif event_type in ("referral.lead", "referral.converted"):
        logger.info("Referral %s (%s) for affiliate %s", data.get("referralId"), event_type, data.get("affiliateId"))
    elif event_type in ("transaction.created", "transaction.approved", "transaction.paid", "transaction.rejected"):
        logger.info(
            "Transaction %s (%s): commission %s %s (%s)",
            data.get("transactionId"), event_type, data.get("commissionAmount"),
            data.get("commissionCurrency"), data.get("commissionStatus"),
        )
    elif event_type in ("payout.paid", "payout.failed"):
        logger.info("Payout %s (%s): %s, status %s", data.get("payoutId"), event_type, data.get("amount"), data.get("status"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
