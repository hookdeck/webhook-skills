# Generated with: ordinal-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Ordinal webhook receiver for FastAPI.

Ordinal signs every delivery per Standard Webhooks:
  webhook-id         stable id for the event (the same on a retry)
  webhook-timestamp  Unix seconds when the delivery was signed
  webhook-signature  "v1,<base64 HMAC-SHA256>", space-separated when two
                     signatures arrive during a secret rotation
  webhook-topic      the event type; NOT covered by the signature
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the signing secret after its `whsec_` prefix. The secret
is in the Create webhook response (`signingSecret`) and on the webhook's
configure page in the dashboard.
"""

import logging
import os
from typing import Any, Callable, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("ordinal-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Ordinal Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# webhook-id is the same on every retry of an event.
processed_event_ids: set = set()


def signature_headers(get: Callable[[str], Optional[str]]) -> Optional[Dict[str, str]]:
    """Read the three signed headers, or return None if any is missing."""
    headers = {
        "webhook-id": get("webhook-id"),
        "webhook-timestamp": get("webhook-timestamp"),
        "webhook-signature": get("webhook-signature"),
    }
    return headers if all(headers.values()) else None


def verify_ordinal_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Ordinal delivery with the Standard Webhooks library.

    It accepts a match on any `v1,` entry and raises if `webhook-timestamp` is
    more than five minutes from now. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_ordinal_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Ordinal envelope or raises."""
    secret = os.environ.get("ORDINAL_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("ORDINAL_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers.get)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_ordinal_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Ordinal webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.event_id = headers["webhook-id"]
    return event


def resource_key_for(event_type: str) -> Optional[str]:
    """The single key inside `data` depends on the event family."""
    if event_type.startswith("social_profile."):
        return "profile"
    if event_type.startswith("linkedin.monitoring.mention."):
        return "mention"
    if event_type.startswith("linkedin.monitoring.comment."):
        return "comment"
    if event_type in ("post.comment.created", "post.inline_comment.created"):
        return "comment"
    if ".approval." in event_type:  # post.approval.* and campaign.approval.*
        return "approval"
    if event_type.startswith("invite."):
        return "invite"
    if event_type.startswith("post."):
        return "post"
    return None


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type") or ""
    key = resource_key_for(event_type)
    r = ((event.get("data") or {}).get(key) if key else None) or {}

    if event_type == "post.published":
        # `postUrl` (the live link) may be null; `url` is the Ordinal app link.
        logger.info("Post published: %s -> %s", r.get("title"), r.get("postUrl"))
    elif event_type == "post.publish_failed":
        logger.info("Publish failed: %s: %s", r.get("title"), r.get("error"))
    elif event_type == "post.content.edited":
        # Debounced per post; carries the latest content for every channel.
        logger.info("Post content edited: %s", r.get("title"))
    elif event_type == "post.approval.requested":
        logger.info(
            "Approval requested on %s from %d approver(s)",
            (r.get("post") or {}).get("title"),
            len(r.get("createdApprovals") or []),
        )
    elif event_type in ("post.comment.created", "post.inline_comment.created"):
        logger.info("Comment on %s: %s", (r.get("post") or {}).get("title"), r.get("message"))
    elif event_type == "social_profile.reconnect_needed":
        logger.info("Profile needs reconnecting: %s (%s)", r.get("name"), r.get("channel"))
    elif event_type.startswith("linkedin.monitoring.comment."):
        logger.info("%s on %s: %s", event_type, (r.get("profile") or {}).get("name"), r.get("commentary"))
    elif event_type == "linkedin.monitoring.mention.created":
        logger.info("Company page mentioned: %s", r.get("postUrl"))
    else:
        logger.info("Ordinal event: %s", event_type)


@app.post("/webhooks/ordinal")
async def ordinal_webhook(request: Request, event: Dict[str, Any] = Depends(verified_ordinal_event)):
    event_id = request.state.event_id
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Any 2xx acknowledges the delivery. In production, enqueue the event here.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Ordinal event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
