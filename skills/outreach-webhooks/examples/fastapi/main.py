# Generated with: outreach-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Outreach Webhook Handler")


def verify_outreach_signature(raw_body: bytes, signature_header, secret) -> bool:
    """Outreach sends Outreach-Webhook-Signature (bare hex HMAC-SHA256 of the raw
    body, keyed with the webhook's secret) only when the webhook has a secret.
    https://developers.outreach.io/api/webhooks#authenticity-validation"""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Constant-time compare on bytes so non-ASCII input can't raise
    return hmac.compare_digest(signature_header.strip().lower().encode("utf-8"), expected.encode("utf-8"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/outreach")
async def outreach_webhook(request: Request):
    secret = os.getenv("OUTREACH_WEBHOOK_SECRET")
    if not secret:
        logger.error("OUTREACH_WEBHOOK_SECRET is not set")
        return JSONResponse(status_code=500, content={"error": "Webhook secret not configured"})

    # Raw body: read bytes first, parse only after verification
    raw_body = await request.body()
    signature = request.headers.get("outreach-webhook-signature")

    if not signature:
        # Usually means the webhook was created without a `secret` attribute
        return JSONResponse(status_code=400, content={"error": "Missing Outreach-Webhook-Signature header"})

    if not verify_outreach_signature(raw_body, signature, secret):
        logger.error("Outreach webhook signature verification failed")
        return JSONResponse(status_code=400, content={"error": "Invalid signature"})

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # JSON:API payload: data {type, id, attributes}, meta {deliveredAt, eventName}
    meta = payload.get("meta") or {} if isinstance(payload, dict) else {}
    data = payload.get("data") or {} if isinstance(payload, dict) else {}
    event_name = meta.get("eventName")
    record_id = data.get("id") if isinstance(data, dict) else None

    if event_name == "prospect.created":
        logger.info("Prospect created: %s", record_id)
    elif event_name == "prospect.updated":
        logger.info("Prospect updated: %s", record_id)
    elif event_name == "sequenceState.created":
        logger.info("Prospect added to a sequence (sequenceState %s)", record_id)
    elif event_name == "call.created":
        logger.info("Call logged: %s", record_id)
    elif event_name == "task.completed":
        logger.info("Task completed: %s", record_id)
    elif event_name == "mailing.replied":
        logger.info("Mailing replied: %s", record_id)
    else:
        logger.info("Unhandled event: %s", event_name)

    # Respond fast: Outreach times out after 5 seconds and never retries on a status code
    return {"received": True}
