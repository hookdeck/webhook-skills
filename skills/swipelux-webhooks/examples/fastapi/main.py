# Generated with: swipelux-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Swipelux Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/swipelux")
async def swipelux_webhook(request: Request):
    secret = os.environ.get("SWIPELUX_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("SWIPELUX_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Swipelux (Svix) signed
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
        print(f"Swipelux webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # v3 envelope: {id, type, createdAt, attempt, resource: {type, id}, data: {object, previous}}
    # `id` is the event id: deduplicate on it. `attempt` is NOT a dedupe key or retry counter.
    event_type = event.get("type")
    resource = event.get("resource") if isinstance(event.get("resource"), dict) else {}
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    obj = data.get("object") if isinstance(data.get("object"), dict) else {}
    previous = data.get("previous") if isinstance(data.get("previous"), dict) else {}
    print(f"Received Swipelux webhook {event.get('id')}: {event_type} ({resource.get('type')} {resource.get('id')})")

    # Delivery is at least once and may be reordered: persist event["id"], return 2xx, then refetch
    # the current resource from the API (e.g. GET /v3/transfers/{id}) before acting on it.
    if event_type in ("customer.created", "customer.updated", "customer.archived"):
        print(f"Customer {event_type.split('.')[1]}: {resource.get('id')}")
    elif event_type in ("capability.created", "capability.status_changed"):
        print(f"Capability {event_type.split('.')[1]}: {resource.get('id')} {obj.get('status')}")
    elif event_type == "application.status_changed":
        print(f"Application status changed: {resource.get('id')} {obj.get('status')}")
    elif event_type == "recipient.status_changed":
        print(f"Recipient status changed: {resource.get('id')} {obj.get('status')}")
    elif event_type == "destination.status_changed":
        print(f"Destination status changed: {resource.get('id')} {obj.get('status')}")
    elif event_type in ("account.created", "account.status_changed", "account.details_changed"):
        print(f"Account {event_type.split('.')[1]}: {resource.get('id')} {obj.get('status')}")
    elif event_type == "transfer.state_changed":
        # data.previous.state is the prior state (awaiting_funds, processing, action_required, completed, failed, canceled)
        print(f"Transfer state changed: {resource.get('id')} {previous.get('state')} -> {obj.get('state')}")
    else:
        # Return 2xx for events you don't handle, or Svix keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
