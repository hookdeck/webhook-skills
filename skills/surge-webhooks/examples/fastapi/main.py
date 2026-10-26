# Generated with: surge-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Surge webhook receiver for FastAPI.

Surge delivers webhooks with Standard Webhooks signatures:
  webhook-id         unique id for the delivery
  webhook-timestamp  Unix seconds when the event was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
Hookdeck's Surge source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("surge-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Surge Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Envelope: {id, type, timestamp, account_id, data}. Some of Surge's examples
# omit `id`, so fall back to type + data.id.
processed_event_keys: set = set()


def event_key(event: Dict[str, Any]) -> Optional[str]:
    if event.get("id"):
        return event["id"]
    data_id = (event.get("data") or {}).get("id")
    return f"{event.get('type')}:{data_id}" if data_id else None


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


def verify_surge_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Surge delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_surge_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Surge event or raises."""
    secret = os.environ.get("SURGE_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SURGE_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_surge_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Surge webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Messages ------------------------------------------------------------
    if event_type == "message.received":
        # Reply with POST /accounts/{account_id}/messages and conversation.id.
        logger.info(
            "Inbound message %s in %s: %s",
            data.get("id"), (data.get("conversation") or {}).get("id"), data.get("body"),
        )
    elif event_type == "message.sent":
        logger.info("Message sent to carrier: %s", data.get("id"))
    elif event_type == "message.delivered":
        logger.info("Message delivered: %s", data.get("id"))
    elif event_type == "message.failed":
        # opted_out and invalid_mobile_number are permanent; carrier_error is transient.
        logger.info("Message failed: %s (%s)", data.get("id"), data.get("failure_reason"))

    # --- Contacts and conversations ------------------------------------------
    elif event_type == "contact.opted_in":
        logger.info("Contact opted in: %s", data.get("id"))
    elif event_type == "contact.opted_out":
        # Suppress this contact in your own systems.
        logger.info("Contact opted out: %s", data.get("id"))
    elif event_type == "conversation.created":
        logger.info("Conversation created: %s", data.get("id"))

    # --- Campaigns and phone numbers -----------------------------------------
    elif event_type == "campaign.approved":
        logger.info("Campaign approved: %s", data.get("id"))
    elif event_type == "phone_number.imported":
        status = (data.get("campaign") or {}).get("attachment_status", "no campaign")
        logger.info("Phone number imported: %s (%s)", data.get("id"), status)
    elif event_type == "phone_number.attached_to_campaign":
        logger.info("Phone number attached to campaign: %s", data.get("id"))

    # --- Links ---------------------------------------------------------------
    elif event_type == "link.followed":
        # data.message_id is deprecated; use data.message.id.
        logger.info("Link followed in message %s", (data.get("message") or {}).get("id"))

    # --- Voice ---------------------------------------------------------------
    elif event_type == "call.ended":
        logger.info("Call ended: %s", data.get("id"))
    elif event_type in ("recording.completed", "voicemail.received"):
        # Download the audio with GET /recordings/{recording_id}/file.
        logger.info("%s: %s", event_type, data.get("id"))

    else:
        # The documented list may not be exhaustive: acknowledge unknown types.
        logger.info("Unhandled Surge event type: %s", event_type)


@app.post("/webhooks/surge")
async def surge_webhook(event: Dict[str, Any] = Depends(verified_surge_event)):
    # Delivery is at-least-once; acknowledge duplicates with 200.
    key = event_key(event)
    if key and key in processed_event_keys:
        return {"received": True, "duplicate": True}

    try:
        # Return 2xx quickly. In production, enqueue the event here and
        # process it asynchronously.
        handle_event(event)
        if key:
            processed_event_keys.add(key)
    except Exception:
        logger.exception("Error handling Surge event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
