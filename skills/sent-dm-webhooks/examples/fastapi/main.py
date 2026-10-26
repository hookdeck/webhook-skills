# Generated with: sent-dm-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Sent (sent.dm) webhook receiver for FastAPI.

Sent signs webhooks Standard Webhooks / Svix style, but on X-Webhook-* names:
  X-Webhook-ID         UUID of the webhook configuration (the SAME on every
                       event, so it is signed but is NOT a dedupe key)
  X-Webhook-Timestamp  Unix seconds at which this attempt was signed
  X-Webhook-Signature  "v1,<base64 HMAC-SHA256>" (space-delimited if several)
  X-Webhook-Event-ID   the event's own UUID, identical on every attempt
Signed content: f"{X-Webhook-ID}.{X-Webhook-Timestamp}.{raw_body}"
Key: base64-decode of the signing secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("sent-dm-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Sent Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Sent delivers at-least-once; X-Webhook-Event-ID is the same on every attempt.
processed_event_ids: set = set()


def verify_sent_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Sent delivery with the Standard Webhooks library.

    The library reads webhook-* header names, so Sent's x-webhook-* headers are
    mapped onto them by the caller. It rejects timestamps more than 5 minutes
    off, recomputes the HMAC over the raw body, and compares in constant time
    against every `v1,` entry. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_sent_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Sent event or raises."""
    secret = os.environ.get("SENT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SENT_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=503, detail="no signing secret configured")

    headers = {
        "webhook-id": request.headers.get("x-webhook-id"),
        "webhook-timestamp": request.headers.get("x-webhook-timestamp"),
        "webhook-signature": request.headers.get("x-webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    # body() reads the bytes whatever the Content-Type is.
    raw_body = await request.body()

    try:
        return verify_sent_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Sent webhook verification failed: %s", err)
        raise HTTPException(status_code=401, detail="invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event")  # dispatch on the body's `event` field
    payload = event.get("payload") or {}

    if event_type == "message.delivered":
        logger.info(
            "Message delivered: %s to %s (%s)",
            payload.get("message_id"),
            payload.get("outbound_number"),
            payload.get("channel"),
        )
    elif event_type == "message.failed":
        logger.info(
            "Message failed: %s (%s: %s)",
            payload.get("message_id"),
            payload.get("reason_code"),
            payload.get("reason"),
        )
    elif event_type == "message.received":
        logger.info("Inbound message from %s: %s", payload.get("inbound_number"), payload.get("text"))
    elif event_type in ("templates.approved", "templates.rejected"):
        logger.info("Template %s %s", payload.get("template_name"), payload.get("status"))
    elif event_type == "contact.opt_out":
        logger.info("Contact opted out: %s (%s)", payload.get("contact_id"), payload.get("source"))
    elif event_type == "channel.activated":
        logger.info("Channel activated: %s sender %s", payload.get("channel"), payload.get("sender_value"))
    else:
        # Sent documents 38 event types and adds more over time. Acknowledge the rest.
        logger.info("Unhandled Sent event: %s", event_type)


@app.post("/webhooks/sent-dm")
async def sent_webhook(request: Request, event: Dict[str, Any] = Depends(verified_sent_event)):
    # Dedupe on the event's own id, NOT x-webhook-id (that is the webhook's id).
    event_id = request.headers.get("x-webhook-event-id")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Sent waits up to 30 s by default (5-120 s per webhook) for a 2xx, and
        # disables a webhook after 10 consecutive failures. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        if event_id:
            processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Sent event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
