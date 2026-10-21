# Generated with: daytona-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Daytona webhook receiver for FastAPI.

Daytona's webhook docs don't describe signing. Deliveries go through Svix:
  svix-id         message ID (same on retries)
  svix-timestamp  Unix seconds when the attempt was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("daytona-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Daytona Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The payload has no event ID, so dedupe on svix-id (stable across retries).
processed_message_ids: set = set()


def verify_daytona_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Daytona delivery with the official Svix library.

    Svix checks the timestamp (5-minute tolerance), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.

    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_daytona_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Daytona payload (plus svix-id) or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("DAYTONA_WEBHOOK_SECRET")
    if not secret:
        logger.error("DAYTONA_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw bytes — parsing the body as JSON first would break the HMAC.
    raw_body = await request.body()
    try:
        payload = verify_daytona_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as exc:
        logger.error("Daytona webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return {"message_id": headers["svix-id"], "payload": payload}


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")

    if event == "sandbox.created":
        logger.info(
            "Sandbox %s created in org %s (%s, %s)",
            payload.get("id"), payload.get("organizationId"), payload.get("sandboxClass"), payload.get("state"),
        )
    elif event == "sandbox.state.updated":
        logger.info("Sandbox %s: %s → %s", payload.get("id"), payload.get("oldState"), payload.get("newState"))
    elif event == "snapshot.created":
        logger.info("Snapshot %s (%s) created, state %s", payload.get("name"), payload.get("id"), payload.get("state"))
    elif event == "snapshot.state.updated":
        logger.info(
            "Snapshot %s (%s): %s → %s",
            payload.get("name"), payload.get("id"), payload.get("oldState"), payload.get("newState"),
        )
    elif event == "snapshot.removed":
        logger.info("Snapshot %s (%s) removed at %s", payload.get("name"), payload.get("id"), payload.get("removedAt"))
    elif event == "volume.created":
        logger.info("Volume %s (%s) created, state %s", payload.get("name"), payload.get("id"), payload.get("state"))
    elif event == "volume.state.updated":
        logger.info(
            "Volume %s (%s): %s → %s",
            payload.get("name"), payload.get("id"), payload.get("oldState"), payload.get("newState"),
        )
    else:
        logger.info("Unhandled Daytona event: %s", event)


@app.post("/webhooks/daytona")
async def daytona_webhook(verified: Dict[str, Any] = Depends(verified_daytona_event)):
    message_id = verified["message_id"]

    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(verified["payload"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Daytona event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
