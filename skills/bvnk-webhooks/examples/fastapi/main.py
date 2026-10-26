# Generated with: bvnk-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
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

logger = logging.getLogger("bvnk-webhooks")
app = FastAPI()

# BVNK sends the standard base64 (padded, 44 chars) HMAC-SHA256 of the raw body in x-signature,
# with no prefix. The key is the secret string's UTF-8 bytes (the "Public Key" field in the BVNK
# Portal); it looks like base64 but is NOT base64-decoded. No timestamp is signed.
# https://docs.bvnk.com/bvnk/get-started/create-webhook-listener
SIGNATURE_RE = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_bvnk(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False
    # Only the canonical 44-character form passes: Hookdeck compares the base64 text exactly.
    if not SIGNATURE_RE.fullmatch(signature_header):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(signature_header.encode("ascii"), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("BVNK_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BVNK_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_bvnk(raw_body, request.headers.get("x-signature"), secret):
        logger.error("BVNK webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/bvnk")
async def bvnk_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # eventId is unique per event: use it to drop duplicates from retries (see webhook-handler-patterns)
    event = payload.get("event")
    event_id = payload.get("eventId")
    data = _as_dict(payload.get("data"))

    if event == "payment:v2:payin:status-change":
        logger.info("[%s] Pay-in status changed", event_id)
    elif event == "bvnk:payment:channel:created":
        logger.info("[%s] Payment channel created", event_id)
    elif event == "bvnk:payment:channel:transaction-confirmed":
        logger.info("[%s] Channel transaction confirmed", event_id)
    elif event in ("bvnk:payment:channel:transaction-on-hold", "bvnk:payment:crypto:transaction-on-hold"):
        logger.info("[%s] Transaction on hold (%s)", event_id, event)
    elif event == "bvnk:ledger:report:ready":
        logger.info("[%s] Ledger report %s (%s) is %s", event_id, data.get("id"), data.get("type"), data.get("status"))
    elif event == "platform:accounts:customer:created":
        logger.info("[%s] Customer created", event_id)
    elif event in ("platform:accounts:customer:status-change", "bvnk:customers:status-change"):
        logger.info("[%s] Customer status changed (%s)", event_id, event)
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
