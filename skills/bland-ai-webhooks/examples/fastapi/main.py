# Generated with: bland-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Bland AI webhook receiver for FastAPI.

Bland signs deliveries with HMAC-SHA256:
  X-Webhook-Signature: hex( HMAC-SHA256(signing secret, request body) )
There is no timestamp or message id. Bland's docs sign JSON.stringify(req.body);
signing the raw bytes is equivalent for the compact JSON Bland sends and
doesn't depend on re-serialisation.

The signing secret is created in Dev Portal > Account Settings > Keys
("Replace Secret"), shown once, and covers every webhook on the account.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("bland-ai-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bland AI Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The same call_id can legitimately arrive more than once (post-call, then
# citations / evals), so the key includes the payload's event_type.
processed_keys: set = set()


def verify_bland_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Compare X-Webhook-Signature to hex HMAC-SHA256 of the raw body."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.strip().lower().encode("utf-8"), expected.encode("utf-8"))


async def verified_payload(request: Request) -> Dict[str, Any]:
    """Dependency: read the raw body, verify the signature, then parse the JSON."""
    secret = os.environ.get("BLAND_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BLAND_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-webhook-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Webhook-Signature header")

    # Raw bytes: the signature covers the body exactly as received, whatever the content type.
    raw_body = await request.body()
    if not verify_bland_signature(raw_body, signature, secret):
        logger.error("Bland webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    return payload


def dedupe_key(payload: Dict[str, Any]) -> Optional[str]:
    ident = payload.get("call_id") or payload.get("conversation_id")
    if not ident:
        return None
    return f"{ident}:{payload.get('event_type') or payload.get('status') or 'post_call'}"


def handle_payload(payload: Dict[str, Any]) -> None:
    # Bland doesn't send an event name on the standard post-call payload. Voice
    # calls carry call_id + status; enrichments add event_type; SMS carries
    # conversation_id. Ignore keys you don't recognise: payloads are additive.
    if payload.get("conversation_id"):
        logger.info("SMS conversation %s (%s)", payload["conversation_id"], payload.get("status") or "message")
        return

    call_id = payload.get("call_id")
    event_type = payload.get("event_type")
    if event_type == "citations":
        logger.info("Call %s: %d citations", call_id, len(payload.get("citations") or []))
    elif event_type == "post_transfer_transcript":
        logger.info("Call %s: post-transfer transcript received", call_id)
    elif event_type == "evals":
        logger.info("Call %s: eval scores received", call_id)
    elif event_type == "multiple":
        logger.info("Call %s: combined payload (%s)", call_id, ", ".join(payload.get("contents") or []))
    elif payload.get("error_message"):
        # Call failures still arrive as a normal 200 delivery with the error in the payload.
        logger.info("Call %s failed: %s", call_id, payload["error_message"])
    elif payload.get("status") == "completed":
        logger.info(
            "Call %s completed (%s min, %d transcript turns)",
            call_id,
            payload.get("call_length"),
            len(payload.get("transcripts") or []),
        )
    else:
        logger.info("Call %s status: %s", call_id, payload.get("status"))


@app.post("/webhooks/bland-ai")
async def bland_webhook(payload: Dict[str, Any] = Depends(verified_payload)):
    key = dedupe_key(payload)
    if key and key in processed_keys:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast and return 2xx; store or enqueue the payload and process it afterwards.
        handle_payload(payload)
        if key:
            processed_keys.add(key)
    except Exception:
        logger.exception("Error handling Bland payload")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
