# Generated with: pine-labs-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Pine Labs webhook receiver for FastAPI.

Pine Labs Online signs with the Standard Webhooks headers:
  webhook-id         event ID (same when the webhook is resent)
  webhook-timestamp  Unix seconds when the event was triggered
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: the secret key from the Pine Labs dashboard as its raw UTF-8 bytes. Pine Labs' docs say to
base64-encode the key and then base64-decode it again, which is a no-op.
Don't use the standardwebhooks or svix libraries: they base64-decode the secret.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("pine-labs-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Pine Labs Webhook Handler")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set PINE_LABS_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("PINE_LABS_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "PINE_LABS_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def signature_headers(headers) -> Dict[str, Optional[str]]:
    """Read webhook-* headers; when webhook-id is absent, use the svix-* headers instead."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "id": headers.get(f"{prefix}-id"),
        "timestamp": headers.get(f"{prefix}-timestamp"),
        "signature": headers.get(f"{prefix}-signature"),
    }


def signing_key(secret: str) -> bytes:
    """Standard Webhooks key: base64-decoded `whsec_` secrets, anything else as raw UTF-8 bytes."""
    if secret.startswith("whsec_"):
        try:
            return base64.b64decode(secret[len("whsec_"):])
        except (binascii.Error, ValueError) as exc:
            raise WebhookVerificationError("Secret is not valid base64") from exc
    return secret.encode("utf-8")


def verify_signature(raw_body: bytes, sig: Dict[str, Optional[str]], secret: str, tolerance: Optional[int] = None) -> None:
    """Verify a Standard Webhooks delivery from Pine Labs; raise if it's invalid."""
    msg_id, timestamp, signature_header = sig["id"], sig["timestamp"], sig["signature"]
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing signature headers")
    if not (timestamp.isascii() and timestamp.isdigit() and not timestamp.startswith("0")):
        raise WebhookVerificationError("Invalid webhook-timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    key = signing_key(secret)
    if not key:
        raise WebhookVerificationError("Empty signing key")  # fail closed
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # The header is a space-delimited list of "v1,<base64>" entries; any v1 match is valid
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return
    raise WebhookVerificationError("No matching signature")


# In-memory dedupe for the demo. Use Redis or your database in production.
# webhook-id is the same when Pine Labs resends an event.
processed_message_ids: set = set()


def verify_pine_labs_webhook(raw_body: bytes, headers, secret: str) -> Dict[str, Any]:
    """Verify a Pine Labs delivery and return the parsed payload. Raises if it's invalid."""
    verify_signature(raw_body, signature_headers(headers), secret)
    return json.loads(raw_body)


async def verified_pine_labs_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Pine Labs payload (plus webhook-id) or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("PINE_LABS_WEBHOOK_SECRET")
    if not secret:
        logger.error("PINE_LABS_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    sig = signature_headers(request.headers)
    if not all(sig.values()):
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw bytes — parsing the body as JSON first would break the HMAC.
    raw_body = await request.body()
    try:
        payload = verify_pine_labs_webhook(raw_body, request.headers, secret)
    except (WebhookVerificationError, ValueError) as exc:
        logger.error("Pine Labs webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return {"message_id": sig["id"], "payload": payload}


def handle_event(payload: Dict[str, Any]) -> None:
    # Order events carry `event_type`; payout events (and some Pay by Points orders) use `eventType`.
    event = payload.get("event_type") or payload.get("eventType")
    data = payload.get("data") or {}

    if event in ("CUSTOMER_ACTIVATED", "CUSTOMER_DELETED", "CUSTOMER_SUSPENDED", "CUSTOMER_CREATION_FAILED"):
        customer = data.get("customer") or {}
        logger.info("%s: customer %s (%s)", event, customer.get("customer_id"), customer.get("status"))
    elif event in (
        "ORDER_AUTHORIZED", "ORDER_PROCESSED", "ORDER_CANCELLED", "PAYMENT_FAILED",
        "ORDER_FAILED", "ORDER_SETTLED", "ORDER_SETTLEMENT_REJECTED",
    ):
        # Events can arrive out of order (ORDER_PROCESSED before ORDER_AUTHORIZED): don't assume a sequence
        amount = data.get("order_amount") or {}
        logger.info(
            "%s: order %s is %s (%s %s)",
            event, data.get("order_id"), data.get("status"), amount.get("value"), amount.get("currency"),
        )
    elif event in ("REFUND_PROCESSED", "REFUND_FAILED"):
        logger.info("%s: refund %s of order %s is %s", event, data.get("order_id"), data.get("parent_order_id"), data.get("status"))
    elif event in ("TOKEN_ACTIVATED", "TOKEN_DEACTIVATED", "TOKEN_SUSPENDED", "TOKEN_PROVISION_FAILED"):
        token = data.get("token") or {}
        logger.info("%s: token %s (%s)", event, token.get("token_id"), token.get("status"))
    elif event in (
        "SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_PENDING", "SUBSCRIPTION_PAUSED", "SUBSCRIPTION_RESUMED",
        "SUBSCRIPTION_COMPLETED", "SUBSCRIPTION_CHARGED", "SUBSCRIPTION_HALTED", "SUBSCRIPTION_CANCELLED",
        "SUBSCRIPTION_REVOKE_FAILED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_UPDATE_FAILED",
    ):
        subscription = data.get("subscription") or {}
        logger.info("%s: subscription %s (%s)", event, subscription.get("subscription_id"), subscription.get("status"))
    elif event in ("payout-transaction-success", "payout-transaction-failed"):
        logger.info(
            "%s: payout %s (%s) is %s",
            event, data.get("clientReferenceId"), data.get("paymentReferenceId"), data.get("status"),
        )
    else:
        logger.info("Unhandled Pine Labs event: %s", event)


@app.post("/webhooks/pine-labs")
async def pine_labs_webhook(verified: Dict[str, Any] = Depends(verified_pine_labs_event)):
    message_id = verified["message_id"]

    # Duplicates are normal (retries) — acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously: Pine Labs
        # wants a 2XX within 5 seconds.
        handle_event(verified["payload"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Pine Labs event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
