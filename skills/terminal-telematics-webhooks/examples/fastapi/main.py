# Generated with: terminal-telematics-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Terminal Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/terminal-telematics")
async def terminal_telematics_webhook(request: Request):
    secret = os.environ.get("TERMINAL_TELEMATICS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TERMINAL_TELEMATICS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        # Deliveries from Terminal always carry svix-* (or webhook-*) signature headers
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Terminal (via Svix) signed
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
        print(f"Terminal webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `type`; the related entities sit under `detail`
    event_type = event.get("type") if isinstance(event.get("type"), str) else None
    detail = event.get("detail") if isinstance(event.get("detail"), dict) else {}
    action = event_type.split(".")[1] if event_type and "." in event_type else None
    # The delivery id (svix-id) is stable across retries: use it to deduplicate
    print(f"Received Terminal webhook {msg_id}: {event_type} ({event.get('id')})")

    def entity_id(key: str):
        value = detail.get(key)
        return value.get("id") if isinstance(value, dict) else None

    connection = detail.get("connection") if isinstance(detail.get("connection"), dict) else {}

    if event_type in ("connection.created", "connection.completed", "connection.reconnected", "connection.updated"):
        provider = connection.get("provider") or {}
        print(f"Connection {action}: {connection.get('id')} {provider.get('code') if isinstance(provider, dict) else None}")
    elif event_type == "connection.disconnected":
        # Credentials stopped working: the user has to re-authenticate through Link
        print(f"Connection disconnected: {connection.get('id')}")
    elif event_type in ("connection.pending_deletion", "connection.deleted"):
        print(f"Connection {action}: {connection.get('id')}")
    elif event_type in ("sync.requested", "sync.started"):
        print(f"Sync {action}: {entity_id('sync')} connection {connection.get('id')}")
    elif event_type in ("sync.completed", "connection.first_sync_completed"):
        # Data is ready to read. For S3/data deliveries wait for delivery.completed instead
        print(f"{event_type}: {entity_id('sync')} connection {connection.get('id')}")
    elif event_type == "sync.failed":
        sync = detail.get("sync") if isinstance(detail.get("sync"), dict) else {}
        print(f"Sync failed: {sync.get('id')} {sync.get('failureReason')}")
    elif event_type in ("delivery.requested", "delivery.started", "delivery.completed", "delivery.failed"):
        print(f"Delivery {action}: {entity_id('delivery')} destination {entity_id('destination')}")
    elif event_type in ("issue.reported", "issue.resolved"):
        issue = detail.get("issue") if isinstance(detail.get("issue"), dict) else {}
        print(f"Issue {action}: {issue.get('id')} {issue.get('status')} connection {connection.get('id')}")
    elif event_type == "provider.availability_updated":
        # Not tied to a connection: every subscribed application receives it for every provider
        provider = detail.get("provider") if isinstance(detail.get("provider"), dict) else {}
        print(f"Provider availability updated: {provider.get('code')} {detail.get('availability', {}).get('current') if isinstance(detail.get('availability'), dict) else None}")
    elif event_type == "unsupported_provider.requested":
        print(f"Unsupported provider requested: {detail.get('provider')}")
    elif event_type in ("vehicle.added", "vehicle.modified", "vehicle.removed"):
        print(f"Vehicle {action}: {entity_id('vehicle')} connection {connection.get('id')}")
    elif event_type in ("driver.added", "driver.modified", "driver.removed"):
        print(f"Driver {action}: {entity_id('driver')} connection {connection.get('id')}")
    elif event_type in ("trailer.added", "trailer.modified", "trailer.removed"):
        print(f"Trailer {action}: {entity_id('trailer')} connection {connection.get('id')}")
    elif event_type in ("safety_event.added", "safety_event.modified"):
        print(f"Safety event {action}: {entity_id('safetyEvent')} connection {connection.get('id')}")
    elif event_type == "link.analytics_event_emitted":
        # Link flow telemetry; most apps ignore it
        pass
    else:
        # Return 200 for events you don't handle, or Terminal keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
