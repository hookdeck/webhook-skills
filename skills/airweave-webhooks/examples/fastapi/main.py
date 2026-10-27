# Generated with: airweave-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Airweave Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/airweave")
async def airweave_webhook(request: Request):
    secret = os.environ.get("AIRWEAVE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("AIRWEAVE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Airweave (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Airweave webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Flat body: the event name is the top-level `event_type`, and the ids sit beside it.
    # The body has no event id: deduplicate on the svix-id header, which is stable across retries.
    # Deliveries are not ordered, so don't let a late sync.running overwrite a sync.completed.
    event_type = event.get("event_type")
    print(f"Received Airweave webhook {msg_id}: {event_type}")

    if event_type == "sync.pending":
        # A sync job was created and queued
        print(f"Sync queued: {event.get('collection_readable_id')} {event.get('source_type')} {event.get('sync_job_id')}")
    elif event_type == "sync.running":
        print(f"Sync running: {event.get('collection_readable_id')} {event.get('source_type')} {event.get('sync_job_id')}")
    elif event_type == "sync.completed":
        # Entity and chunk counts are present on this event only
        print(f"Sync completed: {event.get('collection_name')} "
              f"{event.get('entities_inserted', 0)} inserted, {event.get('entities_updated', 0)} updated, "
              f"{event.get('entities_deleted', 0)} deleted")
    elif event_type == "sync.failed":
        # `error` carries the reason (for example an expired auth token)
        print(f"Sync failed: {event.get('collection_name')} {event.get('error', 'Unknown error')}")
    elif event_type == "sync.cancelled":
        print(f"Sync cancelled: {event.get('collection_readable_id')} {event.get('sync_job_id')}")
    elif event_type == "source_connection.created":
        # The connection may not be authenticated yet (OAuth not finished): check is_authenticated
        print(f"Source connection created: {event.get('source_type')} {event.get('source_connection_id')} "
              f"{event.get('is_authenticated')}")
    elif event_type == "source_connection.auth_completed":
        print(f"Source connection authenticated: {event.get('source_type')} {event.get('source_connection_id')}")
    elif event_type == "source_connection.deleted":
        print(f"Source connection deleted: {event.get('source_type')} {event.get('source_connection_id')}")
    elif event_type == "collection.created":
        print(f"Collection created: {event.get('collection_readable_id')} {event.get('collection_name')}")
    elif event_type == "collection.updated":
        print(f"Collection updated: {event.get('collection_readable_id')} {event.get('collection_name')}")
    elif event_type == "collection.deleted":
        print(f"Collection deleted: {event.get('collection_readable_id')}")
    else:
        # Return 200 for events you don't handle, or Airweave keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
