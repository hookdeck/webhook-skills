# Generated with: spacebring-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Spacebring Webhook Handler")

# Most bodies hold the changed object under a resource-named key beside `type`.
# subscription.* bodies are the bare subscription object and visitors.* bodies carry `visit` only.
RESOURCE_KEYS = ("booking", "company", "event", "ticket", "membership", "order", "application", "visit")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/spacebring")
async def spacebring_webhook(request: Request):
    secret = os.environ.get("SPACEBRING_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("SPACEBRING_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Spacebring (Svix) signed
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
        print(f"Spacebring webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Svix's headers carry no event type. Most bodies have a top-level `type`, but the docs never
    # show its value, so log what arrives and fall back gracefully when it is missing.
    event_type = event.get("type") if isinstance(event.get("type"), str) else None
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Spacebring webhook {msg_id}: {event_type or '(no type field)'}")

    def resource_id():
        key = next((k for k in RESOURCE_KEYS if isinstance(event.get(k), dict)), None)
        return event[key].get("id") if key else event.get("id")

    if event_type in ("booking.created", "booking.updated", "booking.deleted", "booking.paid"):
        print(f"Booking {event_type.split('.')[1]}: {resource_id()}")
    elif event_type in ("company.created", "company.deleted"):
        print(f"Company {event_type.split('.')[1]}: {resource_id()}")
    elif event_type in ("membership.created", "membership.invited"):
        print(f"Membership {event_type.split('.')[1]}: {resource_id()}")
    elif event_type in ("event.created", "event.updated", "event.deleted", "event.canceled"):
        print(f"Event {event_type.split('.')[1]}: {resource_id()}")
    elif event_type in ("event.ticket.created", "event.ticket.paid"):
        print(f"Event ticket {event_type.split('.')[2]}: {resource_id()}")
    elif event_type in ("shop.order.created", "shop.order.paid"):
        print(f"Shop order {event_type.split('.')[2]}: {resource_id()}")
    elif event_type in ("subscription.created", "subscription.updated", "subscription.deleted", "subscription.purchased"):
        # The body is the bare subscription object
        print(f"Subscription {event_type.split('.')[1]}: {resource_id()}")
    elif event_type == "support.ticket.created":
        print(f"Support ticket created: {resource_id()}")
    elif event_type == "benefit.application.created":
        print(f"Benefit application created: {resource_id()}")
    elif event_type == "invoice.issued":
        # No body schema is documented for this event
        print(f"Invoice issued: {resource_id()}")
    elif event_type in ("location.created", "location.updated", "location.deleted",
                        "resource.created", "resource.updated", "resource.deleted"):
        # No body schema is documented for location.* or resource.* events
        print(f"{event_type.split('.')[0]} {event_type.split('.')[1]}: {resource_id()}")
    elif event_type in ("visitors.request.approved", "visitors.visit.checked_in", "visitors.visit.checked_out"):
        # The body carries `visit` only
        visit = event.get("visit") if isinstance(event.get("visit"), dict) else {}
        print(f"Visitors {' '.join(event_type.split('.')[1:])}: {visit.get('id')}")
    else:
        # Return 200 for events you don't handle, or Spacebring keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
