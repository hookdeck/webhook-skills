# Generated with: flexprice-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Flexprice Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/flexprice")
async def flexprice_webhook(request: Request):
    secret = os.environ.get("FLEXPRICE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("FLEXPRICE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        # Self-hosted Flexprice without Svix sends no signature headers at all
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Flexprice (Svix) signed
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
        print(f"Flexprice webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`; the changed object sits under a
    # resource-named key (invoice, payment, subscription, ...), not under `data`
    event_type = event.get("event_type")
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Flexprice webhook {msg_id}: {event_type}")

    def obj_id(key: str):
        value = event.get(key)
        return value.get("id") if isinstance(value, dict) else None

    if event_type in ("customer.created", "customer.updated", "customer.deleted"):
        print(f"Customer {event_type.split('.')[1]}: {obj_id('customer')}")
    elif event_type == "subscription.created":
        print(f"Subscription created: {obj_id('subscription')}")
    elif event_type == "subscription.activated":
        print(f"Subscription activated: {obj_id('subscription')}")
    elif event_type == "subscription.updated":
        print(f"Subscription updated: {obj_id('subscription')}")
    elif event_type == "subscription.plan_changed":
        print(f"Subscription plan changed: {obj_id('subscription')}")
    elif event_type == "subscription.cancelled":
        print(f"Subscription cancelled: {obj_id('subscription')}")
    elif event_type == "invoice.update.finalized":
        invoice = event.get("invoice") or {}
        print(f"Invoice finalized: {invoice.get('id')} {invoice.get('amount_due')} {invoice.get('currency')}")
    elif event_type == "invoice.update.payment":
        # Read the status from the payload, not the event name: messages can arrive out of order
        invoice = event.get("invoice") or {}
        print(f"Invoice payment status changed: {invoice.get('id')} {invoice.get('payment_status')}")
    elif event_type == "invoice.update.voided":
        print(f"Invoice voided: {obj_id('invoice')}")
    elif event_type == "invoice.payment.overdue":
        print(f"Invoice overdue: {obj_id('invoice')}")
    elif event_type == "payment.success":
        print(f"Payment succeeded: {obj_id('payment')}")
    elif event_type == "payment.failed":
        print(f"Payment failed: {obj_id('payment')}")
    elif event_type == "wallet.credit_balance.dropped":
        print(f"Wallet credit balance dropped: {obj_id('wallet')}")
    elif event_type == "checkout.session.completed":
        print("Checkout session completed")
    elif event_type == "event.rejected":
        # A usage event matched no meter and was dropped
        print("Usage event rejected")
    else:
        # Return 200 for events you don't handle, or Flexprice keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
