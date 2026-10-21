# Generated with: daytona-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Daytona webhook receiver for FastAPI.

Daytona's webhook docs don't describe signing. Deliveries go through Svix:
  svix-id         message ID (same on retries)
  svix-timestamp  Unix seconds when the attempt was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("daytona-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Daytona Webhook Handler")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set DAYTONA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("DAYTONA_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "DAYTONA_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def verify_svix_signature(raw_body: bytes, headers, secret: str, tolerance: int | None = None) -> None:
    """Verify a Svix-signed delivery (the Standard Webhooks scheme); raise if it's invalid.

    Written out rather than calling the `svix` SDK, because the SDK always enforces a
    5-minute timestamp window. Hookdeck retries and replays carry the original
    svix-timestamp, so that window would reject them. Here the window is opt-in via
    DAYTONA_TIMESTAMP_TOLERANCE_SECONDS.
    """
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing Svix signature headers")
    if not (timestamp.isascii() and timestamp.isdigit()):
        raise WebhookVerificationError("Invalid svix-timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    # Key = base64-decoded secret after the whsec_ prefix
    try:
        key = base64.b64decode(secret[len("whsec_"):] if secret.startswith("whsec_") else secret)
    except (binascii.Error, ValueError) as exc:
        raise WebhookVerificationError("Secret is not valid base64") from exc
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
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
# The payload has no event ID, so dedupe on svix-id (stable across retries).
processed_message_ids: set = set()


def verify_daytona_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Daytona delivery and return the parsed payload. Raises if it's invalid."""
    verify_svix_signature(raw_body, headers, secret)
    return json.loads(raw_body)


async def verified_daytona_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Daytona payload (plus svix-id) or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("DAYTONA_WEBHOOK_SECRET")
    if not secret:
        logger.error("DAYTONA_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw bytes — parsing the body as JSON first would break the HMAC.
    raw_body = await request.body()
    try:
        payload = verify_daytona_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as exc:
        logger.error("Daytona webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return {"message_id": headers["svix-id"], "payload": payload}


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")

    if event == "sandbox.created":
        logger.info(
            "Sandbox %s created in org %s (%s, %s)",
            payload.get("id"), payload.get("organizationId"), payload.get("sandboxClass"), payload.get("state"),
        )
    elif event == "sandbox.state.updated":
        logger.info("Sandbox %s: %s → %s", payload.get("id"), payload.get("oldState"), payload.get("newState"))
    elif event == "snapshot.created":
        logger.info("Snapshot %s (%s) created, state %s", payload.get("name"), payload.get("id"), payload.get("state"))
    elif event == "snapshot.state.updated":
        logger.info(
            "Snapshot %s (%s): %s → %s",
            payload.get("name"), payload.get("id"), payload.get("oldState"), payload.get("newState"),
        )
    elif event == "snapshot.removed":
        logger.info("Snapshot %s (%s) removed at %s", payload.get("name"), payload.get("id"), payload.get("removedAt"))
    elif event == "volume.created":
        logger.info("Volume %s (%s) created, state %s", payload.get("name"), payload.get("id"), payload.get("state"))
    elif event == "volume.state.updated":
        logger.info(
            "Volume %s (%s): %s → %s",
            payload.get("name"), payload.get("id"), payload.get("oldState"), payload.get("newState"),
        )
    else:
        logger.info("Unhandled Daytona event: %s", event)


@app.post("/webhooks/daytona")
async def daytona_webhook(verified: Dict[str, Any] = Depends(verified_daytona_event)):
    message_id = verified["message_id"]

    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(verified["payload"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Daytona event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
