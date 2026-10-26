# Generated with: relay-messenger-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Relay webhook receiver for FastAPI.

Relay delivers webhooks with Standard Webhooks signatures:
  webhook-id         unique event identifier
  webhook-timestamp  Unix seconds when the webhook was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the subscription's secret after its `whsec_` prefix.
Each webhook subscription has its own signing secret.
Hookdeck's Relay source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("relay-messenger-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Relay Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# event_id is the same on every retry and on every subscription.
processed_event_ids: set = set()


def resolve_signature_headers(headers) -> Optional[Dict[str, str]]:
    """Read the three signature headers: webhook-* first, svix-* when
    webhook-id is absent. Returns them under the webhook-* names the library
    expects, or None if any is missing."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {
        "webhook-id": msg_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
    }


def verify_relay_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Relay delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_relay_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Relay event or raises."""
    secret = os.environ.get("RELAY_MESSENGER_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("RELAY_MESSENGER_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_relay_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Relay webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event_type")
    data = event.get("data") or {}

    # --- Messages ------------------------------------------------------------
    if event_type == "message.received":
        # Inbound message from a person or another agent. parts[] holds the content.
        sender = data.get("from_handle") or {}
        logger.info(
            "Message %s received in chat %s from %s (%s)",
            data.get("id"),
            data.get("chat_id"),
            sender.get("handle"),
            sender.get("kind"),
        )
    elif event_type == "message.sent":
        logger.info("Message %s sent in chat %s", data.get("id"), data.get("chat_id"))
    elif event_type in ("message.delivered", "message.read"):
        logger.info("%s: message %s", event_type, data.get("id"))
    elif event_type == "message.failed":
        # Fires when the recipient agent's message.received webhook went terminal.
        # code, reason and detail_code are useful for support requests; don't branch on detail_code.
        logger.info(
            "Message %s failed (code %s): %s",
            data.get("message_id"),
            data.get("code"),
            data.get("reason"),
        )

    # --- Reactions -----------------------------------------------------------
    elif event_type in ("reaction.added", "reaction.removed"):
        logger.info(
            "%s: %s on message %s from %s",
            event_type,
            data.get("reaction_type"),
            data.get("message_id"),
            (data.get("from_handle") or {}).get("handle"),
        )

    # --- Chats and participants ---------------------------------------------
    elif event_type == "chat.created":
        logger.info("Chat created: %s (group: %s)", data.get("id"), data.get("is_group"))
    elif event_type in ("participant.added", "participant.removed"):
        logger.info(
            "%s: %s in chat %s",
            event_type,
            (data.get("participant") or {}).get("handle"),
            data.get("chat_id"),
        )

    else:
        # Relay documents 27 event types; subscribe only to the ones you handle.
        logger.info("Unhandled Relay event type: %s", event_type)


@app.post("/webhooks/relay-messenger")
async def relay_webhook(event: Dict[str, Any] = Depends(verified_relay_event)):
    # Delivery is at-least-once; acknowledge duplicates with 200.
    event_id = event.get("event_id")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Relay waits 10 seconds per attempt. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        if event_id:
            processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Relay event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
