# Generated with: bugsmash-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""BugSmash webhook receiver for FastAPI.

BugSmash signs every delivery:
  X-BugSmash-Signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
  X-Webhook-Timestamp   Unix seconds when the payload was signed
Signed content: f"{X-Webhook-Timestamp}.{raw request body}"
Key: the secret_key as UTF-8 bytes, whole (including "bgsmsh_"), not decoded.
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

logger = logging.getLogger("bugsmash-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_bugsmash_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a BugSmash delivery.

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
    """Opt-in replay window. Unset or 0 = off (Hookdeck retries keep the original timestamp)."""
    try:
        tolerance = float(os.getenv("BUGSMASH_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if tolerance <= 0:
        return True
    try:
        ts = float(timestamp)
    except ValueError:
        return False
    return abs(time.time() - ts) <= tolerance


def handle_event(payload: Dict[str, Any]) -> None:
    # BugSmash's docs list these events but document no delivery body, so the
    # field carrying the event name is unknown. This reads `event`, then `type`,
    # from an ILLUSTRATIVE payload ({"event": "new_comment", "data": {...}}).
    # Check a real delivery (POST /webhook/test) and adjust.
    event_type = payload.get("event") or payload.get("type")
    data = payload.get("data", payload)

    if event_type == "new_comment":
        logger.info("New comment %s", data)
    elif event_type == "comment_replied":
        logger.info("Comment replied %s", data)
    elif event_type == "status_changed":
        logger.info("Status changed %s", data)
    elif event_type == "comment_updated":
        logger.info("Comment updated %s", data)
    else:
        logger.info("Unhandled BugSmash event: %s", event_type)


# BugSmash doesn't document the HTTP method, so accept any of them.
@app.api_route(
    "/webhooks/bugsmash",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def bugsmash_webhook(request: Request):
    secret = os.getenv("BUGSMASH_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BUGSMASH_WEBHOOK_SECRET is not set - rejecting delivery")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Raw bytes, never request.json(). A missing body (e.g. GET) is b"".
    raw_body = await request.body()
    signature = request.headers.get("x-bugsmash-signature")
    timestamp = request.headers.get("x-webhook-timestamp")

    if not verify_bugsmash_signature(raw_body, signature, timestamp, secret):
        logger.error("BugSmash signature verification failed")
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
    # handling idempotent (no delivery id header is documented).
    handle_event(payload)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
