# Generated with: attio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("attio_webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Idempotency-Key values already processed. In-memory for the example only:
# use a durable store (DB unique constraint, Redis SET NX) in production.
processed_keys: set[str] = set()


def verify_attio_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify an Attio webhook signature.

    Attio-Signature = hex(HMAC-SHA256(webhook_secret, raw_body)), no prefix or timestamp.
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Compare bytes: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(signature.lower().encode(), expected.encode())


async def verified_attio_body(request: Request) -> bytes:
    """FastAPI dependency: return the raw body only if the Attio signature is valid."""
    secret = os.environ.get("ATTIO_WEBHOOK_SECRET")
    if not secret:
        logger.error("ATTIO_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Attio sends the same value in both headers; X-Attio-Signature is for legacy middleware
    signature = request.headers.get("attio-signature") or request.headers.get("x-attio-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Use the raw bytes - never re-serialize parsed JSON before verifying
    raw_body = await request.body()
    if not verify_attio_signature(raw_body, signature, secret):
        logger.error("Attio webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    return raw_body


def handle_event(event: dict) -> None:
    """Handle a single Attio event. Payloads contain IDs only; fetch full data
    from the Attio REST API if you need it."""
    event_type = event.get("event_type")
    ids = event.get("id") or {}

    if event_type == "record.created":
        logger.info("Record created: %s (object %s)", ids.get("record_id"), ids.get("object_id"))
        # TODO: Sync the new record to your system

    elif event_type == "record.updated":
        logger.info("Record updated: %s (attribute %s)", ids.get("record_id"), ids.get("attribute_id"))
        # TODO: Fetch the record and sync the changed attribute

    elif event_type == "record.deleted":
        logger.info("Record deleted: %s", ids.get("record_id"))
        # TODO: Remove the record downstream

    elif event_type == "record.merged":
        logger.info("Record %s merged into %s", event.get("duplicate_record_id"), ids.get("record_id"))
        # TODO: Re-point references to the merged record

    elif event_type == "list-entry.created":
        logger.info("List entry created: %s in list %s", ids.get("entry_id"), ids.get("list_id"))
        # TODO: Start pipeline automation

    elif event_type == "list-entry.updated":
        logger.info("List entry updated: %s (attribute %s)", ids.get("entry_id"), ids.get("attribute_id"))
        # TODO: React to stage/status changes

    elif event_type == "list-entry.deleted":
        logger.info("List entry deleted: %s from list %s", ids.get("entry_id"), ids.get("list_id"))
        # TODO: Clean up pipeline state

    elif event_type == "note.created":
        logger.info("Note created: %s on record %s", ids.get("note_id"), event.get("parent_record_id"))
        # TODO: Mirror the note

    elif event_type == "task.created":
        logger.info("Task created: %s", ids.get("task_id"))
        # TODO: Create a ticket or reminder

    elif event_type == "comment.created":
        logger.info("Comment created: %s in thread %s", ids.get("comment_id"), event.get("thread_id"))
        # TODO: Notify a channel

    else:
        logger.info("Unhandled Attio event: %s", event_type)


@app.post("/webhooks/attio")
async def attio_webhook(request: Request, raw_body: bytes = Depends(verified_attio_body)):
    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Idempotency-Key is stable across retries and redeliveries
    idempotency_key = request.headers.get("idempotency-key")
    if idempotency_key and idempotency_key in processed_keys:
        logger.info("Duplicate delivery %s, skipping", idempotency_key)
        return {"received": True, "duplicate": True}

    # Each delivery currently holds one event, but Attio may batch in future
    events = payload.get("events")
    events = events if isinstance(events, list) else []
    logger.info("Received %d event(s) from webhook %s", len(events), payload.get("webhook_id"))

    try:
        for event in events:
            handle_event(event)
    except Exception:
        logger.exception("Error handling Attio webhook")
        # Non-2xx makes Attio retry (up to 10 times over ~3 days)
        raise HTTPException(status_code=500, detail="Handler error")

    if idempotency_key:
        processed_keys.add(idempotency_key)

    # Respond within 5 seconds with any 2xx
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
