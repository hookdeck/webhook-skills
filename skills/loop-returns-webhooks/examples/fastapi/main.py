# Generated with: loop-returns-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

logger = logging.getLogger("uvicorn.error")


def verify_loop_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """
    Verify the X-Loop-Signature header.

    Signature: base64(HMAC-SHA256(secret, raw request body))
    """
    if not signature or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("ascii")

    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/loop-returns")
async def loop_returns_webhook(
    request: Request,
    x_loop_signature: Optional[str] = Header(None),
):
    # Read the raw bytes: the signature covers the exact body Loop sent
    raw_body = await request.body()

    if not x_loop_signature:
        raise HTTPException(status_code=400, detail="Missing X-Loop-Signature header")

    if not verify_loop_signature(raw_body, x_loop_signature, os.getenv("LOOP_WEBHOOK_SECRET")):
        logger.error("Loop webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The trigger (event name) is in the body, not in a header
    topic = payload.get("topic")
    trigger = payload.get("trigger")
    logger.info("Received Loop %s webhook: %s", topic, trigger)

    if trigger == "return.created":
        logger.info("Return created: %s", payload.get("id"))
        # TODO: Notify support, sync the new return to your OMS/WMS, etc.

    elif trigger == "return.updated":
        logger.info("Return updated: %s state: %s", payload.get("id"), payload.get("state"))
        # TODO: Sync state changes (open, closed, cancelled, review, expired)

    elif trigger == "return.closed":
        logger.info("Return closed: %s", payload.get("id"))
        # TODO: Finalize the return in your own systems

    elif trigger == "return.processing.failed":
        logger.info("Return processing failed: %s", payload.get("id"))
        # TODO: Alert the team so the return can be retried or handled manually

    elif trigger == "label.created":
        logger.info(
            "Label created: %s %s %s",
            payload.get("id"), payload.get("carrier"), payload.get("tracking_number"),
        )
        # TODO: Store the tracking number, notify the customer, etc.

    elif trigger == "label.updated":
        logger.info("Label updated: %s status: %s", payload.get("id"), payload.get("label_status"))
        # TODO: Track the shipment status (in_transit, delivered, ...)

    elif trigger == "restock.requested":
        logger.info("Restock requested: %s", payload.get("id"))
        # TODO: Update inventory

    elif trigger == "giftcard.requested":
        logger.info("Gift card requested: %s", payload.get("id"))
        # TODO: Issue the gift card for the exchange

    elif trigger == "shipment.processed":
        logger.info("Happy Returns shipment processed: %s", payload.get("id"))
        # TODO: Update fulfillment records

    else:
        logger.info("Unhandled trigger: %s", trigger)

    # Loop expects a 2xx within 10 seconds; failures are retried (5 retries)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
