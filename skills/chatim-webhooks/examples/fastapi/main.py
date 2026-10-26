# Generated with: chatim-webhooks skill
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

logger = logging.getLogger("chatim-webhooks")
app = FastAPI()

# Chatim sends X-Chatim-Signature: "sha256=<hex>" and X-Chatim-Timestamp (Unix seconds).
# The signature is HMAC-SHA256 (hex) of "<X-Chatim-Timestamp>.<raw body>" keyed with the webhook secret.
# https://chatim.app/en/documentation/webhooks/

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set CHATIM_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("CHATIM_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "CHATIM_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_chatim(raw_body: bytes, signature_header, timestamp_header, secret: str) -> bool:
    if not secret or not signature_header or not timestamp_header:
        return False

    # Accept "sha256=<hex>" or the bare digest; validate length and alphabet before decoding
    hex_digest = signature_header[len("sha256="):] if signature_header.startswith("sha256=") else signature_header
    if not re.fullmatch(r"[0-9a-fA-F]{64}", hex_digest):
        return False
    received = bytes.fromhex(hex_digest)

    # Opt-in replay window; X-Chatim-Timestamp is Unix seconds
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", timestamp_header):
            return False
        if abs(time.time() - int(timestamp_header)) > tolerance:
            return False

    # Signed message as bytes: timestamp header (latin-1, untouched) + "." + raw body bytes
    message = b"".join([timestamp_header.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    return hmac.compare_digest(received, expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("CHATIM_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("CHATIM_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_chatim(
        raw_body,
        request.headers.get("x-chatim-signature"),
        request.headers.get("x-chatim-timestamp"),
        secret,
    ):
        # Chatim treats 4xx as a permanent failure (no retry), so only answer 4xx for a bad signature
        logger.error("Chatim webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/chatim")
async def chatim_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Use payload["eventId"] (or the X-Chatim-Delivery-Id header) for idempotency
    event = payload.get("event")
    data = payload.get("data") or {}
    visitor = data.get("visitor") or {}
    chat = payload.get("chatUuid")

    if event == "chat.started":
        logger.info("Chat %s started by %s on %s", chat, visitor.get("name") or visitor.get("uuid"), (data.get("page") or {}).get("url"))
    elif event == "chat.message.received":
        logger.info("Message from %s: %s", visitor.get("name") or visitor.get("uuid"), data.get("message"))
    elif event == "chat.form.submitted":
        logger.info('Form "%s" submitted: %s', data.get("formName"), data.get("fields"))
    elif event == "chat.closed":
        logger.info("Chat %s closed by %s after %ss", chat, data.get("closedBy"), data.get("duration"))
    elif event == "chat.assigned":
        logger.info("Chat %s assigned to %s", chat, (data.get("assignedTo") or {}).get("name"))
    elif event == "chat.handoff":
        logger.info("Chat %s handed off to live chat: %s", chat, data.get("reason"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
