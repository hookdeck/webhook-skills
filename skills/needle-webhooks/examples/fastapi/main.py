# Generated with: needle-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Needle webhook receiver for FastAPI.

Needle signs webhooks with Standard Webhooks headers:
  webhook-id         the event id (same value when a request is sent again)
  webhook-timestamp  Unix seconds when this request was sent
  webhook-signature  "v1,<base64 signature>" (one or more, space-separated)
Signed content is f"{webhook-id}.{webhook-timestamp}.{raw_body}", HMAC-SHA256,
keyed with the base64-decoded part of the `whsec_` secret after the prefix.

Body: {"version": "v1", "id", "type", "timestamp", "data"} where `data` is the event.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("needle-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Needle Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# A resend keeps the same webhook-id.
processed_message_ids: set = set()


def verify_needle_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Needle delivery with the Standard Webhooks library.

    It rejects timestamps more than 5 minutes off (fixed), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,` entry.
    Raises if verification fails.

    Hookdeck retries/replays resend the ORIGINAL timestamp, so a late one
    fails here (Needle's own retries carry a fresh timestamp). See references/verification.md for a manual verifier
    where the window can be dropped or widened.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_needle_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Needle body or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("NEEDLE_WEBHOOK_SECRET")
    if not secret:
        logger.error("NEEDLE_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body, any content type: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        body = verify_needle_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Needle webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return body


def handle_event(body: Dict[str, Any]) -> None:
    event_type = body.get("type")
    event_id = body.get("id")
    data = body.get("data") or {}
    inner = data.get("data") or {}

    if event_type == "lead_created":
        logger.info(
            "Lead created: %s (%s, event %s)",
            data.get("leadName") or data.get("leadId"),
            data.get("leadEmail") or "no email",
            event_id,
        )
    elif event_type == "lead_updated":
        # data.data.changes lists each changed field
        logger.info("Lead updated: %s (event %s)", data.get("leadId"), event_id)
    elif event_type == "linkedin_message_received":
        # A reply: route it to a human and stop automated follow-ups
        logger.info(
            "LinkedIn reply from %s: %s (event %s)",
            data.get("leadName") or data.get("leadId"),
            inner.get("text"),
            event_id,
        )
    elif event_type == "enrollment_completed":
        logger.info(
            "Enrollment %s completed in campaign %s (event %s)",
            data.get("enrollmentId"),
            data.get("campaignId"),
            event_id,
        )
    elif event_type == "campaign_status_changed":
        logger.info(
            "Campaign %s status changed: %s (event %s)",
            data.get("campaignId"),
            inner.get("message"),
            event_id,
        )
    elif event_type == "account_disconnected":
        # The account needs signing in again; its campaigns wait until it does
        logger.info(
            "Account %s disconnected: %s (event %s)",
            data.get("connectedAccountId"),
            inner.get("errorKind"),
            event_id,
        )
    else:
        # Needle adds event types over time: ignore ones you don't know
        logger.info("Unhandled Needle event type: %s", event_type)


@app.post("/webhooks/needle")
async def needle_webhook(request: Request, body: Dict[str, Any] = Depends(verified_needle_event)):
    # A resend keeps the webhook-id, so acknowledge duplicates with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Answer within 10 seconds. In production, enqueue here and process asynchronously.
        handle_event(body)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Needle event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
