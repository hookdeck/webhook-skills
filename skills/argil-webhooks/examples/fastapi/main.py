# Generated with: argil-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Argil webhook receiver for FastAPI.

Argil signs webhooks per Standard Webhooks:
  webhook-id         unique message ID (stable across retries)
  webhook-timestamp  Unix seconds
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
Webhooks created before Argil added signing are unsigned: recreate them.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("argil-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Argil Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Delivery is at-least-once and the body has no event ID: dedupe on webhook-id.
processed_message_ids: set = set()


def verify_argil_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Argil delivery with the Standard Webhooks library.

    It recomputes the HMAC over the raw body, compares in constant time
    against every `v1,` entry and enforces a fixed 5-minute timestamp window.
    Hookdeck retries and replays resend the original timestamp, so late ones
    fail here: see the manual verifier in references/verification.md to drop
    or widen the window. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(
        raw_body,
        {
            "webhook-id": headers["webhook-id"],
            "webhook-timestamp": headers["webhook-timestamp"],
            "webhook-signature": headers["webhook-signature"],
        },
    )


async def verified_argil_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified {event, data} body or raises."""
    secret = os.environ.get("ARGIL_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("ARGIL_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        # Webhooks created before Argil added signing arrive without these headers.
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature",
        )

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        payload = verify_argil_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Argil webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.message_id = headers["webhook-id"]
    return payload


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "VIDEO_GENERATION_SUCCESS":
        logger.info(
            "Video ready: %s (%s) %s, cost %s",
            data.get("videoId"),
            data.get("videoName"),
            data.get("videoUrl"),
            data.get("renderCost"),
        )
    elif event == "VIDEO_GENERATION_FAILED":
        logger.info(
            "Video failed: %s (%s), refunded %s",
            data.get("videoId"),
            data.get("message"),
            data.get("renderCostRefunded"),
        )
    elif event == "AVATAR_TRAINING_SUCCESS":
        logger.info("Avatar trained: %s (%s)", data.get("avatarId"), data.get("avatarName"))
    elif event == "AVATAR_TRAINING_FAILED":
        logger.info("Avatar training failed: %s (%s)", data.get("avatarId"), data.get("avatarName"))
    else:
        logger.info("Unhandled Argil event: %s", event)


@app.post("/webhooks/argil")
async def argil_webhook(request: Request, payload: Dict[str, Any] = Depends(verified_argil_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.message_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Argil needs a 2xx within 10 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(payload)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Argil event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
