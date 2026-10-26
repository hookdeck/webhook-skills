# Generated with: trackstar-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Trackstar Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/trackstar")
async def trackstar_webhook(request: Request):
    secret = os.environ.get("TRACKSTAR_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TRACKSTAR_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Trackstar (Svix) signed
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
        print(f"Trackstar webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`; the changed object is `data`, and
    # `connection_id` / `integration_name` say which customer connection it came from
    event_type = event.get("event_type")
    connection_id = event.get("connection_id")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    previous = event.get("previous_attributes") if isinstance(event.get("previous_attributes"), dict) else {}
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Trackstar webhook {msg_id}: {event_type} (connection {connection_id})")

    if event_type == "connection.created":
        print(f"Connection created: {connection_id} {event.get('integration_name')}")
    elif event_type == "connection.deleted":
        print(f"Connection deleted: {connection_id}")
    elif event_type == "connection.historical-sync-completed":
        # Resource webhooks are not sent during the initial sync; this marks the point data is queryable
        print(f"Historical sync completed: {connection_id}")
    elif event_type == "connection.sync-job-stuck":
        print(f"Sync job stuck: {connection_id}")
    elif event_type == "connection-error.created":
        print(f"Connection error created: {connection_id}")
    elif event_type == "install.failed":
        print(f"Install failed: {event.get('integration_name')}")
    elif event_type == "order.created":
        print(f"Order created: {data.get('id')} {data.get('status')}")
    elif event_type == "order.updated":
        # previous_attributes holds the old values, with dot-joined paths for nested fields
        print(f"Order updated: {data.get('id')} changed: {list(previous)}")
    elif event_type == "order.shipment.created":
        print(f"Order shipment created: {data.get('id')}")
    elif event_type == "inventory.updated":
        print(f"Inventory updated: {data.get('id')} changed: {list(previous)}")
    elif event_type == "inbound-shipment.updated":
        print(f"Inbound shipment updated: {data.get('id')} {data.get('status')}")
    else:
        # Return 200 for events you don't handle, or Svix keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
