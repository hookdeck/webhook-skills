# Generated with: basiq-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Basiq webhook receiver for FastAPI.

Basiq signs webhooks with Standard Webhooks:
  webhook-id         unique message ID
  webhook-timestamp  Unix seconds
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.

Basiq notifications are thin: {"eventTypeId", "eventId", "links": {"event", "eventEntity"}}.
Fetch links.event / links.eventEntity with your Basiq API token for the data.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("basiq-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Basiq Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Dedupe on the webhook-id header.
processed_message_ids: set = set()

KNOWN_EVENTS = {
    "user.created", "user.updated", "user.deleted",
    "connection.created", "connection.activated", "connection.invalidated", "connection.deleted",
    "consent.created", "consent.updated", "consent.warning", "consent.reminder",
    "consent.expired", "consent.revoked",
    "account.updated", "transactions.updated",
}


def verify_basiq_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Basiq delivery with the Standard Webhooks library.

    Checks the timestamp (fixed 5-minute window), recomputes the HMAC over the raw
    body, and compares in constant time against every `v1,` entry. Hookdeck retries
    and replays resend the original timestamp, so the window rejects late ones; for a
    configurable window, see the manual verifier in references/verification.md.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_basiq_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Basiq event or raises."""
    secret = os.environ.get("BASIQ_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BASIQ_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_basiq_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Basiq webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("eventTypeId")
    entity = (event.get("links") or {}).get("eventEntity", "unknown")

    if event_type in KNOWN_EVENTS:
        logger.info("%s: %s", event_type, entity)
    else:
        logger.info("Unhandled Basiq event type: %s", event_type)


@app.post("/webhooks/basiq")
async def basiq_webhook(request: Request, event: Dict[str, Any] = Depends(verified_basiq_event)):
    # Duplicates are possible; acknowledge with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Basiq event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
