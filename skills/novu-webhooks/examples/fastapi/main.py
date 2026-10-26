# Generated with: novu-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Novu Webhook Handler")

MESSAGE_EVENTS = {
    "message.sent", "message.delivered", "message.seen", "message.read", "message.unread",
    "message.archived", "message.unarchived", "message.snoozed", "message.unsnoozed",
    "message.deleted",
}
WORKFLOW_EVENTS = {"workflow.created", "workflow.updated", "workflow.published", "workflow.deleted"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/novu")
async def novu_webhook(request: Request):
    secret = os.environ.get("NOVU_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("NOVU_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
    prefix = "webhook" if request.headers.get("webhook-id") else "svix"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Novu (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
        Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Novu webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {id, type, object, timestamp, environmentId, data}.
    # `type` is the event name; top-level `object` is only the resource kind
    # (message | workflow | preference | email_inbound). The resource is `data.object`,
    # and update events add `data.previousObject`.
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    resource = data.get("object") if isinstance(data.get("object"), dict) else {}
    error = data.get("error") if isinstance(data.get("error"), dict) else {}
    mail = resource.get("mail") if isinstance(resource.get("mail"), dict) else {}
    route = resource.get("route") if isinstance(resource.get("route"), dict) else {}
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Novu webhook {msg_id}: {event_type}")

    if event_type in MESSAGE_EVENTS:
        # Message fields use Mongo-style names: `_id`, `subscriberId`, `channel`, `status`, ...
        print(f"Message {event_type.split('.')[1]}: {resource.get('_id')} {resource.get('subscriberId')}")
    elif event_type == "message.failed":
        # `data.error` can accompany `object` on message.failed (and message.sent)
        print(f"Message failed: {resource.get('_id')} {error.get('message') or resource.get('errorText')}")
    elif event_type == "email.received":
        print(f"Inbound email received: {mail.get('subject')} at {route.get('address')}")
    elif event_type == "preference.updated":
        # The subscriber is `data.subscriberId`; `data.object` is the updated preference
        print(f"Preference updated: {data.get('subscriberId')} {resource.get('level')} {resource.get('enabled')}")
    elif event_type in WORKFLOW_EVENTS:
        # workflow.deleted carries the stored workflow (`_id`); the others carry the API shape (`workflowId`)
        print(f"Workflow {event_type.split('.')[1]}: {resource.get('workflowId') or resource.get('_id')}")
    else:
        # Return 200 for events you don't handle, or Novu keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
