# Generated with: meeting-baas-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Meeting BaaS Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/meeting-baas")
async def meeting_baas_webhook(request: Request):
    secret = os.environ.get("MEETING_BAAS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("MEETING_BAAS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Meeting BaaS (Svix) signed
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
        print(f"Meeting BaaS webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope is {event, data}: the event name is the top-level `event`.
    # `extra` echoes what you set on the bot: inside `data` for most events, beside `data` for bot.chat_message.
    event_type = event.get("event")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    extra = data.get("extra", event.get("extra"))
    # Deliveries can repeat and arrive out of order: deduplicate on the `svix-id` header.
    print(f"Received Meeting BaaS webhook {msg_id}: {event_type}")

    if event_type == "bot.status_change":
        # data.status.code is the new status, e.g. in_call_recording; data.status.error_message on failures
        status = data.get("status") if isinstance(data.get("status"), dict) else {}
        print(f"Bot status: {data.get('bot_id')} {status.get('code')} {extra}")
    elif event_type == "bot.completed":
        # Artifact URLs are presigned and valid for 4 hours: download them promptly
        print(f"Bot completed: {data.get('bot_id')} {data.get('mp4')} {data.get('transcription')} "
              f"{data.get('duration_seconds')} {extra}")
    elif event_type == "bot.chat_message":
        # Only participant messages are delivered, not the bot's own
        print(f"Chat message: {data.get('bot_id')} {data.get('sender_name')} {data.get('text')} {extra}")
    elif event_type == "bot.failed":
        print(f"Bot failed: {data.get('bot_id')} {data.get('error_code')} {data.get('error_message')} {extra}")
    elif event_type == "calendar.connection_created":
        print(f"Calendar connected: {data.get('calendar_id')} {data.get('platform')} {data.get('account_email')}")
    elif event_type == "calendar.connection_updated":
        print(f"Calendar connection updated: {data.get('calendar_id')} {data.get('status')}")
    elif event_type == "calendar.connection_deleted":
        print(f"Calendar connection deleted: {data.get('calendar_id')}")
    elif event_type == "calendar.connection_error":
        print(f"Calendar connection error: {data.get('calendar_id')} {data.get('error')}")
    elif event_type == "calendar.events_synced":
        print(f"Calendar events synced: {data.get('calendar_id')} {data.get('events_synced')} {data.get('sync_type')}")
    elif event_type == "calendar.event_created":
        print(f"Calendar event created: {data.get('calendar_id')} {data.get('series_id')} {len(data.get('instances') or [])}")
    elif event_type == "calendar.event_updated":
        print(f"Calendar event updated: {data.get('calendar_id')} {data.get('series_id')} {len(data.get('affected_instances') or [])}")
    elif event_type == "calendar.event_cancelled":
        print(f"Calendar event cancelled: {data.get('calendar_id')} {data.get('series_id')} {len(data.get('cancelled_instances') or [])}")
    else:
        # Return 200 for events you don't handle (the list may not be exhaustive), or Meeting BaaS retries them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
