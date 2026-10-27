# Generated with: agntix-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Agntix Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/agntix")
async def agntix_webhook(request: Request):
    secret = os.environ.get("AGNTIX_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("AGNTIX_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Agntix (Svix) signed
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
        print(f"Agntix webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Flat envelope (no `data`): {id, eventType, type, platform, direction, state, agentId, createdAt, metadata, ...}
    # `eventType` is the event name. `type` is the session kind (VOICE | CHAT), NOT the event name.
    # `id` is the session UUID: deduplicate on id + eventType (both events share the session id).
    event_type = event.get("eventType")
    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    analysis = event.get("analysis") if isinstance(event.get("analysis"), dict) else {}
    print(f"Received Agntix webhook {event_type} for session {event.get('id')} ({event.get('type')} {event.get('platform')} {event.get('direction')})")

    # Delivery is at least once: persist id + eventType, return 2xx, then process asynchronously.
    if event_type == "session.created":
        # Fired when the session is initiated (for outbound calls, before pickup)
        print(f"Session created: {event.get('id')} {event.get('state')} {metadata.get('sessionVariables')}")
    elif event_type == "session.ended":
        # Carries the post-call analysis; some analysis fields appear only if enabled on the agent
        print(f"Session ended: {event.get('id')} {event.get('endedAt')} {analysis.get('summary')} {event.get('recordingUrl')}")
    else:
        # Planned events are not delivered yet. Return 2xx for anything unknown, or Svix keeps retrying
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "eventType": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
