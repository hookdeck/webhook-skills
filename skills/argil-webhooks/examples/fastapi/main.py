# Generated with: argil-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Argil webhook receiver for FastAPI.

Argil signs webhooks per Standard Webhooks:
  webhook-id         event ID (stable across retries)
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix, returned once by
POST /webhooks. The body is `{event, data}` with SCREAMING_SNAKE events.
"""

import logging
import os
from typing import Any, Callable, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("argil-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Argil Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Deliveries are at least once; webhook-id is the same on every retry.
processed_event_ids: set = set()


def signature_headers(get: Callable[[str], Optional[str]]) -> Optional[Dict[str, str]]:
    """Read the three signature headers.

    `webhook-*` is the documented prefix; if `webhook-id` is absent, fall back
    to `svix-*` (same scheme, other prefix). Returns the values under the names
    the standardwebhooks library expects, or None if any is missing.
    """
    prefix = "webhook" if get("webhook-id") else "svix"
    headers = {
        "webhook-id": get(f"{prefix}-id"),
        "webhook-timestamp": get(f"{prefix}-timestamp"),
        "webhook-signature": get(f"{prefix}-signature"),
    }
    return headers if all(headers.values()) else None


def verify_argil_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Argil delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,` entry.
    Retries and replays (for example from Hookdeck) keep the original
    timestamp, so this rejects them after 5 minutes; see
    references/verification.md for a manual verifier without the window.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_argil_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Argil payload or raises."""
    secret = os.environ.get("ARGIL_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("ARGIL_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers.get)
    if headers is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing Standard Webhooks signature headers. Webhooks created before "
                "Argil added signing are unsigned: recreate the webhook to get a whsec_ secret."
            ),
        )

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        payload = verify_argil_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Argil webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.event_id = headers["webhook-id"]
    return payload


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "VIDEO_GENERATION_SUCCESS":
        logger.info(
            "Video ready: %s (%s) %s cost %s",
            data.get("videoId"),
            data.get("videoName"),
            data.get("videoUrl"),
            data.get("renderCost"),
        )
    elif event == "VIDEO_GENERATION_FAILED":
        logger.info(
            "Video failed: %s: %s (cost %s, refunded %s)",
            data.get("videoId"),
            data.get("message"),
            data.get("renderCost"),
            data.get("renderCostRefunded"),
        )
    elif event == "AVATAR_TRAINING_SUCCESS":
        logger.info(
            "Avatar trained: %s (%s) voice %s",
            data.get("avatarId"),
            data.get("avatarName"),
            data.get("voiceId"),
        )
    elif event == "AVATAR_TRAINING_FAILED":
        logger.info("Avatar training failed: %s (%s)", data.get("avatarId"), data.get("avatarName"))
    else:
        logger.info("Unhandled Argil event: %s", event)


@app.post("/webhooks/argil")
async def argil_webhook(request: Request, payload: Dict[str, Any] = Depends(verified_argil_event)):
    event_id = request.state.event_id
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Argil needs a 2xx within 10 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(payload)
        processed_event_ids.add(event_id)
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
