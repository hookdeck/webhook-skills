import hashlib
import hmac
import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()


def verify_agentline_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """X-Webhook-Signature is the bare hex HMAC-SHA256 of the raw body, keyed with
    the signing secret (UTF-8). No timestamp is signed."""
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header yields False (401) rather than a TypeError (500)
    return hmac.compare_digest(expected.encode(), signature.lower().encode())


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/agentline")
async def agentline_webhook(request: Request):
    secret = os.getenv("AGENTLINE_WEBHOOK_SECRET", "")
    signature = request.headers.get("x-webhook-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Webhook-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="AGENTLINE_WEBHOOK_SECRET not configured")

    # Verify against the RAW body, never a re-serialized version
    raw_body = await request.body()
    if not verify_agentline_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The delivery envelope isn't spelled out in the docs; the events API uses `event_type`
    event_type = event.get("event_type") or event.get("type") or event.get("event")
    logger.info("Received AgentLine webhook: %s (%s)", event_type, event.get("event_id", "no id"))

    if event_type == "call.received":
        logger.info("Inbound call answered")
    elif event_type == "call.utterance":
        # conversation roles here are `user` and `assistant`
        logger.info("Live caller turn")
    elif event_type == "call.completed":
        logger.info("Call completed")
    elif event_type == "call.owner_task":
        logger.info("Owner task requested")
    elif event_type in ("call.failed", "call.busy", "call.no-answer", "call.canceled"):
        logger.info("Call did not connect: %s", event_type)
    elif event_type == "sms.received":
        logger.info("Inbound SMS")
    elif event_type == "webhook.test":
        logger.info("Test webhook received")
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}
