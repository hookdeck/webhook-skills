# Generated with: appstle-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Appstle Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/appstle")
async def appstle_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("APPSTLE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("APPSTLE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Appstle (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces a fixed 5-minute timestamp window. Retries and
        # replays keep the original timestamp, so see references/verification.md for
        # a manual verifier with no window.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Appstle webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {"type": "subscription.created", "data": {...}}
    event_type = event.get("type") if isinstance(event, dict) else None
    data = (event.get("data") if isinstance(event, dict) else None) or {}
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Appstle webhook {svix_id}: {event_type}")

    if event_type == "subscription.created":
        print(f"Subscription created: {data.get('id')} {data.get('customer', {}).get('email')}")
    elif event_type == "subscription.updated":
        print(f"Subscription updated: {data.get('id')}")
    elif event_type == "subscription.activated":
        print(f"Subscription activated: {data.get('id')}")
    elif event_type == "subscription.paused":
        print(f"Subscription paused: {data.get('id')}")
    elif event_type == "subscription.cancelled":
        print(f"Subscription cancelled: {data.get('id')}")
    elif event_type == "subscription.next-order-date-changed":
        print(f"Next order date changed: {data.get('id')} {data.get('nextBillingDate')}")
    elif event_type == "subscription.billing-interval-changed":
        print(f"Billing interval changed: {data.get('id')} {data.get('billingPolicy')}")
    elif event_type == "subscription.billing-success":
        print(f"Billing succeeded for contract {data.get('contractId')} order {data.get('orderName')}")
    elif event_type == "subscription.billing-failure":
        print(f"Billing failed for contract {data.get('contractId')}: {data.get('billingAttemptResponseMessage')}")
    elif event_type == "subscription.billing-skipped":
        print(f"Billing skipped for contract {data.get('contractId')}")
    elif event_type == "subscription.upcoming-order-notification":
        print(f"Upcoming order notification for contract {data.get('contractId')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
