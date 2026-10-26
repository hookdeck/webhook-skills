# Generated with: podium-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Podium webhook receiver for FastAPI.

Podium signs every delivery (only when the webhook was created with a secret):
  podium-signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
  podium-timestamp  Unix MILLISECONDS when the payload was signed
Signed content: f"{podium-timestamp header}.{raw request body}"
Key: the `secret` set when the webhook was created, as UTF-8 bytes, not decoded.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("podium-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_podium_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a Podium delivery.

    The signed message is built as bytes: the timestamp header as latin-1, a
    literal ".", then the raw body bytes exactly as received. The body is never
    decoded or re-serialised.
    """
    if not (secret and signature and timestamp):
        return False
    # Validate length and alphabet before decoding.
    if not HEX_DIGEST.fullmatch(signature):
        return False

    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    # compare_digest on bytes; hex is case-insensitive so decode the header.
    return hmac.compare_digest(expected, bytes.fromhex(signature))


def within_tolerance(timestamp: str) -> bool:
    """Opt-in replay window in seconds. Unset or 0 = off (Hookdeck retries keep the
    original timestamp). podium-timestamp is Unix milliseconds."""
    try:
        tolerance = float(os.getenv("PODIUM_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if tolerance <= 0:
        return True
    try:
        ts = float(timestamp)
    except ValueError:
        return False
    return abs(time.time() * 1000 - ts) <= tolerance * 1000


def handle_event(payload: Dict[str, Any]) -> None:
    # Podium delivers {"data": {...}, "metadata": {"event_type": ..., "version": ...}}.
    # Dispatch on metadata.event_type; the full list (26 events) is in the Podium docs.
    metadata = payload.get("metadata")
    event_type = metadata.get("event_type") if isinstance(metadata, dict) else None
    data = payload.get("data")

    if event_type == "message.received":
        logger.info("Message received %s", data)
    elif event_type == "message.sent":
        logger.info("Message sent %s", data)
    elif event_type == "contact.created":
        logger.info("Contact created %s", data)
    elif event_type == "contact.updated":
        logger.info("Contact updated %s", data)
    elif event_type == "review.created":
        logger.info("Review created %s", data)
    elif event_type == "invoice.payment_succeeded":
        logger.info("Invoice payment succeeded %s", data)
    elif event_type == "call.completed":
        logger.info("Call completed %s", data)
    else:
        logger.info("Unhandled Podium event: %s", event_type)


# Podium doesn't document the HTTP method, so accept any of them.
@app.api_route(
    "/webhooks/podium",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def podium_webhook(request: Request):
    secret = os.getenv("PODIUM_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("PODIUM_WEBHOOK_SECRET is not set - rejecting delivery")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Raw bytes, never request.json(). A missing body (e.g. GET) is b"".
    raw_body = await request.body()
    signature = request.headers.get("podium-signature")
    timestamp = request.headers.get("podium-timestamp")

    if not verify_podium_signature(raw_body, signature, timestamp, secret):
        logger.error("Podium signature verification failed")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)
    if not within_tolerance(timestamp):
        return JSONResponse({"error": "Timestamp outside tolerance"}, status_code=401)

    # Parse only after the signature is verified.
    payload: Dict[str, Any] = {}
    if raw_body:
        try:
            parsed = json.loads(raw_body)
        except ValueError:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)
        payload = parsed if isinstance(parsed, dict) else {"data": parsed}

    # Keep this fast. In production, enqueue and process asynchronously, and make
    # handling idempotent (no delivery id header is documented; use the object ids in `data`).
    handle_event(payload)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
