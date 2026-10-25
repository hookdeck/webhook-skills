# Generated with: beehiiv-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""beehiiv webhook receiver for FastAPI.

beehiiv delivers webhooks through Svix:
  svix-id         unique message ID (same on retries)
  svix-timestamp  Unix seconds when the attempt was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("beehiiv-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="beehiiv Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_event_ids: set = set()


def verify_beehiiv_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify with the official `svix` library, then parse.

    The library always enforces a 5-minute timestamp window. Hookdeck retries and
    replays resend the original svix-timestamp, so they are rejected once older than
    that. references/verification.md has a manual verifier where the window can be
    dropped or widened. Raises WebhookVerificationError on failure.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)  # parse only after the signature check


async def verified_beehiiv_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified beehiiv event or raises."""
    secret = os.environ.get("BEEHIIV_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BEEHIIV_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_beehiiv_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad JSON, bad base64
        logger.error("beehiiv webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event_type")
    data = event.get("data") or {}

    if event_type in ("post.sent", "post.updated", "post.scheduled"):
        logger.info("%s: post %s", event_type, data.get("id") or data.get("post_id") or "(unknown id)")
    elif event_type in (
        "subscription.created",
        "subscription.confirmed",
        "subscription.deleted",
        "subscription.upgraded",
        "subscription.downgraded",
        "subscription.paused",
        "subscription.resumed",
    ):
        logger.info("%s: %s", event_type, data.get("email") or data.get("id") or "(unknown subscriber)")
    elif event_type == "newsletter_list_subscription.subscribed":
        logger.info("List subscription: %s", json.dumps(data))
    elif event_type == "survey.response_submitted":
        logger.info("Survey response submitted: %s", json.dumps(data))
    elif event_type == "podcasts.episode.published":
        logger.info("Podcast episode published: %s", json.dumps(data))
    else:
        logger.info("Unhandled beehiiv event type: %s", event_type)


@app.post("/webhooks/beehiiv")
async def beehiiv_webhook(request: Request, event: Dict[str, Any] = Depends(verified_beehiiv_event)):
    # Duplicates are normal (at-least-once delivery); acknowledge with 200.
    event_id = event.get("uid") or request.headers.get("svix-id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling beehiiv event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
