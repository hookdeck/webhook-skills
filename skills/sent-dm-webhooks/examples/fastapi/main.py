# Generated with: sent-dm-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Sent (sent.dm) webhook receiver for FastAPI.

Sent signs webhooks with the Standard Webhooks scheme. Version 2 webhooks (the
default) send the standard headers; version 1 webhooks use X-Webhook-* names:
  webhook-id / X-Webhook-ID   signed id. v2: the message id, the same on every
                              attempt (the dedupe key). v1: the webhook
                              configuration's UUID, NOT a dedupe key
  webhook-timestamp / X-Webhook-Timestamp  Unix seconds this attempt was signed
  webhook-signature / X-Webhook-Signature  "v1,<base64 HMAC-SHA256>", space-
                              delimited if several
  X-Webhook-Event-ID          v1 only: the event's UUID, the same on every attempt
Signed content: f"{id}.{timestamp}.{raw_body}"
Key: base64-decode of the signing secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

logger = logging.getLogger("sent-dm-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Sent Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Sent delivers at-least-once; webhook-id (v2) or X-Webhook-Event-ID (v1) is the
# same on every attempt.
processed_event_ids: set = set()


def verify_sent_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Sent delivery with the Standard Webhooks library.

    The library reads webhook-* header names: version 2 sends those, and the
    caller passes version 1's x-webhook-* headers under the same names. It rejects timestamps more than 5 minutes
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

    # Version 2 header names first, then version 1's X-Webhook-* names.
    headers = {
        f"webhook-{name}": request.headers.get(f"webhook-{name}")
        or request.headers.get(f"x-webhook-{name}")
        for name in ("id", "timestamp", "signature")
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    # body() reads the bytes whatever the Content-Type is.
    raw_body = await request.body()

    try:
        event = verify_sent_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Sent webhook verification failed: %s", err)
        raise HTTPException(status_code=401, detail="invalid signature")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event")  # dispatch on the body's `event` field
    payload = _as_dict(event.get("payload"))

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
        # Sent documents 39 event types and adds more over time. Acknowledge the rest.
        logger.info("Unhandled Sent event: %s", event_type)


@app.post("/webhooks/sent-dm")
async def sent_webhook(request: Request, event: Dict[str, Any] = Depends(verified_sent_event)):
    # Dedupe on webhook-id (v2) or x-webhook-event-id (v1), NOT v1's x-webhook-id
    # (that is the webhook's id).
    event_id = request.headers.get("webhook-id") or request.headers.get("x-webhook-event-id")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Sent turns off a webhook that keeps failing (version 1: after 10
        # consecutive failed events). In production, enqueue the event here and
        # process it asynchronously.
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
