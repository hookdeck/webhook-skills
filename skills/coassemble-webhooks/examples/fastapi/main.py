# Generated with: coassemble-webhooks skill
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

logger = logging.getLogger("coassemble-webhooks")
app = FastAPI()

# Coassemble sends X-Coassemble-Signature: "sha256=<hex>" and X-Coassemble-Timestamp (Unix seconds).
# The signature is HMAC-SHA256 (hex) of "<X-Coassemble-Timestamp>.<raw body>" keyed with the webhook secret.
# https://developers.coassemble.com/webhooks

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_coassemble(raw_body: bytes, signature_header, timestamp_header, secret: str) -> bool:
    if not secret or not signature_header or not timestamp_header:
        return False

    # Accept "sha256=<hex>" or the bare digest; validate length and alphabet before decoding
    hex_digest = signature_header[len("sha256="):] if signature_header.startswith("sha256=") else signature_header
    if not re.fullmatch(r"[0-9a-fA-F]{64}", hex_digest):
        return False
    received = bytes.fromhex(hex_digest)

    # Opt-in replay window; X-Coassemble-Timestamp is Unix seconds
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
    secret = os.getenv("COASSEMBLE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("COASSEMBLE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_coassemble(
        raw_body,
        request.headers.get("x-coassemble-signature"),
        request.headers.get("x-coassemble-timestamp"),
        secret,
    ):
        # Missing, malformed or wrong signature
        logger.error("Coassemble webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/coassemble")
async def coassemble_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Dedupe on the X-Coassemble-Delivery header: retries and replays keep the same delivery ID
    event = payload.get("type")
    data = _as_dict(payload.get("data"))
    tracking = _as_dict(data.get("tracking"))
    course = _as_dict(data.get("course"))

    # Test deliveries (testMode: true, including the dashboard's test button) are signed and delivered
    # like real ones, so acknowledge them without taking production actions
    if payload.get("testMode"):
        logger.info("Test event %s acknowledged (no action taken)", event)
        return {"received": True, "test": True}

    if event == "course.created":
        logger.info("Course created in workspace %s", payload.get("workspaceId"))
    elif event == "course.commenced":
        logger.info("%s commenced %r", tracking.get("identifier"), course.get("title"))
    elif event == "course.completed":
        logger.info("%s completed %r in %ss", tracking.get("identifier"), course.get("title"), tracking.get("totalTime"))
    elif event == "quiz.completed":
        logger.info("Quiz passed (delivery %s)", payload.get("id"))
    elif event == "quiz.failed":
        logger.info("Quiz failed (delivery %s)", payload.get("id"))
    elif event == "migration.progress":
        item = _as_dict(data.get("item"))
        logger.info("Migration batch %s: %r %s", data.get("id"), item.get("title"), item.get("status"))
    elif event == "migration.completed":
        counts = _as_dict(data.get("counts"))
        logger.info("Migration batch %s %s: %s/%s succeeded", data.get("id"), data.get("status"), counts.get("succeeded"), counts.get("total"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
