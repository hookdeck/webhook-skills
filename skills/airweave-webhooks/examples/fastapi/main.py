# Generated with: airweave-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Airweave webhook receiver for FastAPI.

Airweave delivers webhooks through Svix (Standard Webhooks):
  svix-id         message ID, stable across retries to one subscription
  svix-timestamp  Unix seconds when the delivery attempt was made
  svix-signature  space-delimited "v1,<base64 HMAC-SHA256>" entries
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

logger = logging.getLogger("airweave-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Airweave Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# svix-id is the same on every retry of a message to this subscription.
processed_message_ids: set = set()


def verify_airweave_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Airweave delivery with the official Svix library.

    Svix checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,` entry.

    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_airweave_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Airweave event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("AIRWEAVE_WEBHOOK_SECRET")
    if not secret:
        logger.error("AIRWEAVE_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: the signature covers the exact bytes, so never verify request.json().
    raw_body = await request.body()
    try:
        event = verify_airweave_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("Airweave webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Stash the message ID for deduplication in the route.
    request.state.svix_id = headers["svix-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event_type")

    # --- Sync jobs ------------------------------------------------------------
    if event_type in ("sync.pending", "sync.running", "sync.cancelled"):
        logger.info(
            "%s: job %s for %s (%s)",
            event_type, event.get("sync_job_id"), event.get("collection_name"), event.get("source_type"),
        )
    elif event_type == "sync.completed":
        # Metrics are only present on sync.completed.
        logger.info(
            "Sync completed: %s (%s inserted, %s updated, %s deleted, %s chunks)",
            event.get("collection_name"), event.get("entities_inserted", 0), event.get("entities_updated", 0),
            event.get("entities_deleted", 0), event.get("chunks_written", 0),
        )
        # Trigger your downstream workflow here.
    elif event_type == "sync.failed":
        logger.info(
            "Sync failed: %s (%s) - %s",
            event.get("collection_name"), event.get("source_type"), event.get("error", "Unknown error"),
        )
        # Send an alert here.

    # --- Source connections ----------------------------------------------------
    elif event_type == "source_connection.created":
        logger.info(
            "Source connection created: %s (authenticated: %s)",
            event.get("source_type"), event.get("is_authenticated"),
        )
    elif event_type == "source_connection.auth_completed":
        logger.info(
            "Source connection authenticated: %s %s", event.get("source_type"), event.get("source_connection_id")
        )
    elif event_type == "source_connection.deleted":
        logger.info("Source connection deleted: %s %s", event.get("source_type"), event.get("source_connection_id"))

    # --- Collections -------------------------------------------------------------
    elif event_type in ("collection.created", "collection.updated", "collection.deleted"):
        logger.info("%s: %s (%s)", event_type, event.get("collection_name"), event.get("collection_readable_id"))

    else:
        # The docs say to ignore unknown types so new events don't break you.
        logger.info("Unhandled Airweave event type: %s", event_type)


@app.post("/webhooks/airweave")
async def airweave_webhook(request: Request, event: Dict[str, Any] = Depends(verified_airweave_event)):
    svix_id = request.state.svix_id

    # Duplicates are normal (at-least-once delivery): acknowledge with 200.
    if svix_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Airweave times out after 30 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(svix_id)
    except Exception:
        logger.exception("Error handling Airweave event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
