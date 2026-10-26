# Generated with: travtus-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Travtus Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/travtus")
async def travtus_webhook(request: Request):
    secret = os.environ.get("TRAVTUS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TRAVTUS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Travtus (Svix) signed
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
        print(f"Travtus webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: { event_type, message_id, body }. `message_id` is the Svix message id and `body`
    # is the lease, the task (with a `creator` object) or the AI reply.
    event_type = event.get("event_type")
    body = event.get("body")
    if not isinstance(body, dict):
        body = {}
    # `svix-id` is stable across retries of the same message: use it to deduplicate
    print(f"Received Travtus webhook {msg_id}: {event_type}")

    if event_type == "lease.update":
        print(f"Lease updated: {body.get('identifier')} {body.get('start_date')} {body.get('end_date')} {body.get('rent')}")
    elif event_type in ("task.create", "task.update", "task.delete"):
        creator = body.get("creator") if isinstance(body.get("creator"), dict) else {}
        print(f"Task {event_type.split('.')[1]}: {body.get('identifier')} {body.get('title')} {body.get('status')} {creator.get('email')}")
    elif event_type in ("sms.respond", "email.respond", "web_chat.respond"):
        # AI-generated reply to a message sent through the Messaging API
        print(f"{event_type}: {body.get('conversation_id')} {body.get('channel')} {body.get('message_text')}")
        if body.get("human_handover_ind"):
            print("Travtus suggests a handover to a human")
    else:
        # Return 2xx for events you don't handle, or Travtus keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
