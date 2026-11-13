# Generated with: certn-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

logger = logging.getLogger("certn-webhooks")
app = FastAPI()

# CertnCentric webhooks: https://centric-api-docs.certn.co/#webhooks
# - Endpoint verification: Certn sends GET ?challenge=<value> when you add the URL, and again
#   periodically. Echo the value as the body within 10 seconds, or Certn disables the webhook.
# - Signature: X-Signature is the hex HMAC-SHA256 of the raw request body, keyed with the
#   signing key Certn gives you when you create the webhook. No timestamp, no prefix.

HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_certn(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    if not secret or not signature or not HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Bytes on both sides, so an unexpected header value is a failed match, not an error
    return hmac.compare_digest(signature.lower().encode(), expected.encode())


@app.get("/webhooks/certn")
async def certn_challenge(challenge: Optional[str] = None):
    """Endpoint verification (challenge-response). Not signed: no signature check here."""
    if challenge is None:
        raise HTTPException(status_code=400, detail="Missing challenge")
    return PlainTextResponse(challenge, headers={"X-Content-Type-Options": "nosniff"})


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("CERTN_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("CERTN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_certn(raw_body, request.headers.get("x-signature"), secret):
        logger.error("Certn webhook signature verification failed")
        raise HTTPException(status_code=403, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/certn")
async def certn_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Deduplicate on event["event_id"] before doing work: retries can deliver an event again,
    # and out of order. Return 200 within 10 seconds and do slow work in a background job.
    event_type = event.get("event_type")
    case_id = event.get("object_id")
    if event_type == "CASE_STATUS_CHANGED":
        logger.info("Case %s status: %s", case_id, event.get("case_status"))
    elif event_type == "CHECK_STATUS_CHANGED":
        check = event.get("triggered_check") or {}
        logger.info("Case %s check %s status: %s", case_id, check.get("type"), check.get("status"))
        resolution = check.get("action_required_resolution")
        if resolution:
            # Follow steps[] in ascending `step` order with Certn's API to resolve the check
            logger.info("Client action required: %s", resolution.get("summary"))
    elif event_type == "CASE_REPORT_READY":
        logger.info("Case %s report ready", case_id)
    elif event_type == "CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED":
        logger.info("Case %s has new input claims", case_id)
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
