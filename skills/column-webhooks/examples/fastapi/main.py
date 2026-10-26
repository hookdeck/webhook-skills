# Generated with: column-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("column-webhooks")
app = FastAPI()

# Column signs every delivery with a Column-Signature header: the bare lowercase hex
# HMAC-SHA256 of the raw request body, keyed with the endpoint's signing secret.
# Nothing else is signed (no timestamp or id), so there is no replay window to check.
# https://docs.column.com/markdown/working-with-the-api/events-and-webhooks
HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def verify_column(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not signature:
        return False

    # The whole header is one 64-char hex digest. Check the format first, then compare bytes
    # (str arguments to compare_digest raise TypeError on non-ASCII, so encode both sides).
    signature = signature.lower()
    if not HEX_DIGEST.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(signature.encode(), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("COLUMN_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("COLUMN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_column(raw_body, request.headers.get("column-signature"), secret):
        logger.error("Column webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/column")
async def column_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Delivery is at-least-once: redeliveries keep the same event id (evnt_...), so dedupe on it.
    # Ordering is not guaranteed.
    event_type = event.get("type")
    event_id = event.get("id")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    if event_type == "ach.outgoing_transfer.completed":
        logger.info("ACH transfer completed: %s [%s]", data.get("id"), event_id)
    elif event_type == "ach.outgoing_transfer.returned":
        logger.info("ACH transfer returned: %s [%s]", data.get("id"), event_id)
    elif event_type == "book.transfer.completed":
        logger.info("Book transfer completed: %s [%s]", data.get("id"), event_id)
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
