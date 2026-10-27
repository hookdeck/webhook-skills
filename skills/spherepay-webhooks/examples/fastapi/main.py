# Generated with: spherepay-webhooks skill
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


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

logger = logging.getLogger("spherepay-webhooks")
app = FastAPI()

# SpherePay signs every delivery (this is NOT Standard Webhooks: do not use the standardwebhooks
# or svix libraries):
#   Sphere-Signature = hex( HMAC-SHA256( secret, "{Sphere-Timestamp}.{raw body}" ) )
# The secret is the endpoint's whole whsec_... string, used as a plain UTF-8 key (not decoded).
# https://docs.spherepay.co/concepts/webhooks/verifying-signatures

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

# Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
# original Sphere-Timestamp, so a window would reject legitimate redeliveries. Set
# SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def compute_signature(raw_body: bytes, timestamp: str, secret: str) -> str:
    # Signed message as bytes: timestamp header (latin-1, exactly as received) + "." + raw body bytes
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def verify_spherepay(raw_body: bytes, headers, secret: str) -> bool:
    if not secret:
        return False

    signature = headers.get("sphere-signature")
    timestamp = headers.get("sphere-timestamp")
    if not signature or not timestamp:
        return False

    # The whole header is one bare hex digest: validate it before decoding. Hex is case-insensitive.
    if not HEX_SHA256.fullmatch(signature):
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(time.time() - int(timestamp)) > tolerance:
            return False

    expected = bytes.fromhex(compute_signature(raw_body, timestamp, secret))
    received = bytes.fromhex(signature.lower())
    return hmac.compare_digest(expected, received)


# Raw body is required: the signature covers the exact bytes SpherePay sent, whatever the content type
async def verified_body(request: Request) -> bytes:
    secret = os.getenv("SPHEREPAY_WEBHOOK_SECRET")
    if not secret:
        logger.error("SPHEREPAY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_spherepay(raw_body, request.headers, secret):
        logger.error("SpherePay webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


# SpherePay makes ONE attempt per event (no automatic retries) and expects a 2xx within 15 seconds.
@app.post("/webhooks/spherepay")
async def spherepay_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Delivery is at-least-once and unordered: dedupe on event["id"], compare event["sequence"] for staleness
    event_type = event.get("type")
    data = _as_dict(event.get("data"))

    if event_type in ("customer.created", "customer.pending"):
        logger.info("Customer %s (%s): %s", data.get("id"), event_type, data.get("status"))
    elif event_type == "customer.approved":
        logger.info("Customer approved: %s (profile %s)", data.get("id"), data.get("verificationProfile"))
    elif event_type == "customer.rejected":
        logger.info("Customer rejected: %s (profile %s)", data.get("id"), data.get("verificationProfile"))
    elif event_type in (
        "transfer.created",
        "transfer.pendingFunding",
        "transfer.pendingReview",
        "transfer.fundsReceived",
        "transfer.processing",
    ):
        logger.info("Transfer %s (%s): %s -> %s", data.get("id"), event_type, data.get("previousStatus"), data.get("status"))
    elif event_type == "transfer.succeeded":
        logger.info("Transfer succeeded: %s for customer %s", data.get("id"), data.get("customerId"))
    elif event_type in ("transfer.returned", "transfer.refunded", "transfer.failed"):
        logger.info("Transfer %s (%s): %s -> %s", data.get("id"), event_type, data.get("previousStatus"), data.get("status"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}
