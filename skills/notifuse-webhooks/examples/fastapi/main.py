# Generated with: notifuse-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Notifuse webhook receiver for FastAPI.

Notifuse signs webhooks per Standard Webhooks:
  webhook-id         unique delivery ID
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the subscription's secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("notifuse-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Notifuse Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Dedupe on the webhook-id header: Notifuse may rarely deliver twice.
processed_delivery_ids: set = set()


def signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the three signature headers.

    Notifuse sends webhook-*; if webhook-id is absent, fall back to the svix-*
    names (what Hookdeck does too). The result always uses the webhook-* names
    the standardwebhooks library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_notifuse_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Notifuse delivery with the Standard Webhooks library.

    It enforces a fixed 5-minute timestamp window, recomputes the HMAC over the
    raw body, and compares in constant time against every `v1,` entry. Hookdeck
    retries and replays resend the original timestamp, so late retries fail the
    window; see references/verification.md for a manual verifier without it.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_notifuse_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Notifuse event or raises."""
    secret = os.environ.get("NOTIFUSE_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("NOTIFUSE_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_notifuse_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Notifuse webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.delivery_id = headers["webhook-id"]
    return event


CONTACT_EVENTS = {"contact.created", "contact.updated", "contact.deleted"}
LIST_EVENTS = {
    "list.subscribed",
    "list.unsubscribed",
    "list.confirmed",
    "list.resubscribed",
    "list.bounced",
    "list.complained",
    "list.pending",
    "list.removed",
}
SEGMENT_EVENTS = {"segment.joined", "segment.left"}
EMAIL_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
    "email.unsubscribed",
}
CUSTOM_EVENTS = {"custom_event.created", "custom_event.updated", "custom_event.deleted"}


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type in CONTACT_EVENTS:
        logger.info("%s: %s (%s)", event_type, data.get("email"), data.get("id"))
    elif event_type in LIST_EVENTS:
        # One delivery per contact per list event.
        logger.info("%s: %s", event_type, data.get("email"))
    elif event_type in SEGMENT_EVENTS:
        logger.info(
            "%s: %s / %s (%s)", event_type, data.get("email"), data.get("segment_name"), data.get("segment_id")
        )
    elif event_type in EMAIL_EVENTS:
        logger.info(
            '%s: %s to %s ("%s")', event_type, data.get("message_id"), data.get("email"), data.get("subject")
        )
    elif event_type in CUSTOM_EVENTS:
        logger.info("%s: %s", event_type, data)
    else:
        # The documented list may not be exhaustive: acknowledge unknown types.
        logger.info("Unhandled Notifuse event type: %s", event_type)


@app.post("/webhooks/notifuse")
async def notifuse_webhook(request: Request, event: Dict[str, Any] = Depends(verified_notifuse_event)):
    delivery_id = request.state.delivery_id
    if delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        # Notifuse needs a 2xx within 30 seconds. In production, enqueue the
        # event here and process it asynchronously.
        handle_event(event)
        processed_delivery_ids.add(delivery_id)
    except Exception:
        logger.exception("Error handling Notifuse event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
