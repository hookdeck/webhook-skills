# Generated with: hyperswitch-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # python-dotenv is optional; env vars can be set directly.
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hyperswitch Webhook Handler")

# HMAC-SHA512 hex digest = exactly 128 hex characters. Use fullmatch: "$" also
# matches before a trailing newline.
SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{128}", re.ASCII)

# The 33 event_type wire values listed in Hyperswitch's webhook guide.
KNOWN_EVENT_TYPES = frozenset(
    [
        "payment_succeeded", "payment_failed", "payment_processing", "payment_cancelled",
        "payment_cancelled_post_capture", "payment_authorized", "payment_partially_authorized",
        "payment_captured", "payment_expired", "action_required",
        "refund_succeeded", "refund_failed", "refund_review",
        "dispute_opened", "dispute_expired", "dispute_accepted", "dispute_cancelled",
        "dispute_challenged", "dispute_won", "dispute_lost",
        "mandate_active", "mandate_revoked",
        "payout_success", "payout_failed", "payout_initiated", "payout_processing",
        "payout_cancelled", "payout_expired", "payout_reversed", "payout_not_permitted",
        "invoice_paid", "surcharge_payment_succeeded", "surcharge_refund_succeeded",
    ]
)

# In-memory dedupe on event_id. Use a shared store (Redis, database) in production.
processed_event_ids: Set[str] = set()


def verify_hyperswitch_signature(
    raw_body: bytes, signature_header: Optional[str], secret: str
) -> Dict[str, Any]:
    """Verify the X-Webhook-Signature-512 header.

    Algorithm: HMAC-SHA512, hex digest, no prefix
    Key:       the business profile's payment_response_hash_key, as UTF-8 bytes
    Signed:    the raw request body bytes only (no timestamp, id or other header)
    """
    if not signature_header:
        return {"valid": False, "error": "Missing X-Webhook-Signature-512 header"}
    # Validate the format first. The whole header value is one digest (no list, no prefix).
    if not SIGNATURE_PATTERN.fullmatch(signature_header):
        return {"valid": False, "error": "Malformed signature"}

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    received = bytes.fromhex(signature_header)  # safe: format validated above

    # Compare bytes, never str: compare_digest raises TypeError on non-ASCII str.
    if not hmac.compare_digest(received, expected):
        return {"valid": False, "error": "Invalid signature"}
    return {"valid": True}


def handle_hyperswitch_event(event: Dict[str, Any]) -> None:
    """Dispatch on the top-level `event_type`.

    `content.type` only names the resource shape (payment_details,
    refund_details, ...) held in `content.object`.
    """
    event_type = event.get("event_type")
    if not isinstance(event_type, str):
        event_type = ""
    content = event.get("content")
    obj = (content.get("object") if isinstance(content, dict) else None) or {}

    if event_type == "payment_succeeded":
        logger.info("Payment succeeded: %s", obj.get("payment_id"))
    elif event_type == "payment_failed":
        logger.info("Payment failed: %s %s", obj.get("payment_id"), obj.get("error_message"))
    elif event_type == "action_required":
        logger.info("Payment needs customer action: %s", obj.get("payment_id"))
    elif event_type == "refund_succeeded":
        logger.info("Refund succeeded: %s", obj.get("refund_id"))
    elif event_type == "refund_failed":
        logger.info("Refund failed: %s", obj.get("refund_id"))
    elif event_type == "dispute_opened":
        logger.info("Dispute opened: %s", obj.get("dispute_id"))
    elif event_type in KNOWN_EVENT_TYPES:
        logger.info("Received %s (no specific handler)", event_type)
    else:
        # Hyperswitch may add events: log and acknowledge.
        logger.info("Unhandled Hyperswitch event_type: %s", event_type)


@app.post("/webhooks/hyperswitch")
async def hyperswitch_webhook(request: Request):
    secret = os.environ.get("HYPERSWITCH_WEBHOOK_SECRET")
    if not secret:
        # Fail closed: never accept unverified deliveries.
        logger.error("HYPERSWITCH_WEBHOOK_SECRET is not set; rejecting webhook")
        return PlainTextResponse("Webhook secret not configured", status_code=500)

    # Raw bytes for any content type; parse only after verifying.
    raw_body = await request.body()
    verification = verify_hyperswitch_signature(
        raw_body, request.headers.get("x-webhook-signature-512"), secret
    )
    if not verification["valid"]:
        logger.error("Hyperswitch webhook verification failed: %s", verification["error"])
        return PlainTextResponse(f"Webhook Error: {verification['error']}", status_code=401)

    try:
        event = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return PlainTextResponse("Invalid JSON payload", status_code=400)
    if not isinstance(event, dict):
        return PlainTextResponse("Invalid JSON payload", status_code=400)

    # Retries can deliver the same event twice: acknowledge duplicates without re-applying.
    event_id = event.get("event_id")
    if event_id and event_id in processed_event_ids:
        return JSONResponse({"received": True, "duplicate": True})

    try:
        handle_hyperswitch_event(event)
        if event_id:
            processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error processing Hyperswitch event")
        return PlainTextResponse("Processing error", status_code=500)

    return JSONResponse({"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}
