# Generated with: basiq-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Basiq webhook receiver for FastAPI.

Basiq signs webhooks with the Standard Webhooks scheme:
  webhook-id         unique message ID (same if the message is resent)
  webhook-timestamp  Unix seconds of the attempt
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Each Basiq webhook subscription has its own signing secret.

Payloads are thin (eventTypeId, eventId, links): fetch links.event or
links.eventEntity from the Basiq API with your token to get the data.
"""

import json
import logging
import os
from typing import Any, Dict, Mapping

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("basiq-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Basiq Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# webhook-id stays the same if Basiq resends a message.
processed_message_ids: set = set()


def signature_headers(headers: Mapping[str, str]) -> Dict[str, str]:
    """Pick the header set.

    Hookdeck's Basiq source reads webhook-* and falls back to svix-* when
    webhook-id is absent; do the same, then hand the library the values under
    the webhook-* names it expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_basiq_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> None:
    """Verify a Basiq delivery with the Standard Webhooks library.

    It enforces a fixed 5-minute timestamp window, recomputes the HMAC over the
    raw body, and compares in constant time against every `v1,` entry.
    Hookdeck retries and replays resend the ORIGINAL timestamp, so late ones
    fail here; see references/verification.md for a manual verifier with a
    configurable window. Raises on failure.
    """
    Webhook(secret).verify(raw_body, headers, json_parse=False)


async def verified_basiq_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Basiq event or raises."""
    secret = os.environ.get("BASIQ_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BASIQ_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        verify_basiq_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, ValueError, bad base64, etc.
        logger.error("Basiq webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Verified: only now parse the body.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    request.state.message_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("eventTypeId")
    event_id = event.get("eventId")
    entity = (event.get("links") or {}).get("eventEntity")

    if event_type in ("user.created", "user.updated", "user.deleted"):
        logger.info("%s: %s (event %s)", event_type, entity, event_id)
    elif event_type in (
        "connection.created",
        "connection.activated",
        "connection.invalidated",
        "connection.deleted",
    ):
        logger.info("%s: %s (event %s)", event_type, entity, event_id)
    elif event_type in (
        "consent.created",
        "consent.updated",
        "consent.revoked",
        "consent.expired",
        "consent.reminder",
        "consent.warning",
    ):
        logger.info("%s: %s (event %s)", event_type, entity, event_id)
    elif event_type == "account.updated":
        logger.info("Account updated: %s (event %s)", entity, event_id)
    elif event_type == "transactions.updated":
        logger.info("Transactions updated: %s (event %s)", entity, event_id)
    else:
        logger.info("Unhandled Basiq event type: %s", event_type)


@app.post("/webhooks/basiq")
async def basiq_webhook(request: Request, event: Dict[str, Any] = Depends(verified_basiq_event)):
    # A resent message reuses the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.message_id
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
