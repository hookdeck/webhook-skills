# Generated with: buttondown-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

logger = logging.getLogger("buttondown-webhooks")
app = FastAPI()

# Buttondown signs a delivery only if the webhook has a signing key. The header is
#   X-Buttondown-Signature: sha256=<hex>
# where <hex> is HMAC-SHA256 of the raw request body, keyed with the signing key (UTF-8, used as-is).
# Nothing else is signed: no timestamp, no id, so there is no replay window to check.
# https://docs.buttondown.com/api-webhooks-introduction

_HEX64_RE = re.compile(r"[0-9a-fA-F]{64}", re.ASCII)


def verify_buttondown(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    # Accept the value with or without the sha256= prefix
    signature = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.IGNORECASE)

    # Exactly 64 hex chars, validated before use
    if not _HEX64_RE.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # compare_digest on bytes: a non-ASCII header value gives a mismatch (401), not a 500
    return hmac.compare_digest(signature.lower().encode(), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("BUTTONDOWN_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BUTTONDOWN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_buttondown(raw_body, request.headers.get("x-buttondown-signature"), secret):
        logger.error("Buttondown webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/buttondown")
async def buttondown_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Payload: {event_type, data}. data holds ids (newsletter, subscriber, ...).
    # Delivery is at least once and unordered: make handlers idempotent.
    event_type = event.get("event_type")
    data = _as_dict(event.get("data"))

    if event_type == "subscriber.created":
        logger.info("Subscriber %s created on newsletter %s", data.get("subscriber"), data.get("newsletter"))
    elif event_type == "subscriber.confirmed":
        logger.info("Subscriber %s confirmed on newsletter %s", data.get("subscriber"), data.get("newsletter"))
    elif event_type == "subscriber.unsubscribed":
        logger.info("Subscriber %s unsubscribed from newsletter %s", data.get("subscriber"), data.get("newsletter"))
    elif event_type == "email.sent":
        logger.info("Email %s finished sending", data.get("email"))
    elif event_type == "automation.invoked":
        logger.info("Automation invoked on newsletter %s", data.get("newsletter"))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
