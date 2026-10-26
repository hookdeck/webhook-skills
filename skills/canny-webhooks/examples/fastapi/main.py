# Generated with: canny-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Canny webhook receiver for FastAPI.

Canny signs webhooks with the Standard Webhooks scheme:
  webhook-id         unique message ID
  webhook-timestamp  Unix seconds, covered by the signature
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the signing secret after its `whsec_` prefix.
The legacy canny-timestamp / canny-nonce / canny-signature headers are being
removed and don't cover the body: they are ignored here.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("canny-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Canny Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Canny bodies carry no event ID, so dedupe on the webhook-id header.
processed_message_ids: set = set()


def verify_canny_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Canny delivery with the Standard Webhooks library.

    It recomputes the HMAC over the raw body and compares in constant time
    against every `v1,` entry (two during the 24h after a secret rotation).
    Raises WebhookVerificationError on failure.

    NOTE: the library always enforces a 5-minute timestamp window. Hookdeck
    retries and replays resend the original webhook-timestamp, so a delivery
    retried later than that is rejected. See references/verification.md for a
    manual verifier with a configurable window.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_canny_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Canny event or raises."""
    secret = os.environ.get("CANNY_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("CANNY_WEBHOOK_SECRET is not set; rejecting delivery")
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
        event = verify_canny_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Canny webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    object_type = event.get("objectType")
    obj = event.get("object") or {}

    # --- Posts ---------------------------------------------------------------
    if event_type == "post.created":
        logger.info(
            'Post created: "%s" on %s (%s)',
            obj.get("title"),
            (obj.get("board") or {}).get("name"),
            obj.get("id"),
        )
    elif event_type == "post.edited":
        logger.info("Post edited: %s", obj.get("id"))
    elif event_type == "post.deleted":
        logger.info("Post deleted: %s", obj.get("id"))
    elif event_type == "post.status_changed":
        logger.info('Post %s status changed to "%s"', obj.get("id"), obj.get("status"))
    elif event_type in ("post.tag_added", "post.tag_removed"):
        logger.info("%s: %s", event_type, obj.get("id"))
    elif event_type in ("post.jira_issue_linked", "post.jira_issue_unlinked"):
        logger.info("%s: %s", event_type, obj.get("id"))

    # --- Comments ------------------------------------------------------------
    elif event_type in ("comment.created", "comment.edited", "comment.deleted"):
        logger.info("%s: %s", event_type, obj.get("id"))

    # --- Votes ---------------------------------------------------------------
    elif event_type in ("vote.created", "vote.deleted"):
        logger.info("%s: %s", event_type, obj.get("id"))

    else:
        logger.info("Unhandled Canny event type: %s (%s)", event_type, object_type)


@app.post("/webhooks/canny")
async def canny_webhook(request: Request, event: Dict[str, Any] = Depends(verified_canny_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Canny event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
