# Generated with: superwall-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Superwall Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/superwall")
async def superwall_webhook(request: Request):
    secret = os.environ.get("SUPERWALL_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("SUPERWALL_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Superwall (Svix) signed
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
        print(f"Superwall webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level lowercase `type` in both formats. V2 puts the store facts in
    # `event_data` (snake_case) and the event id in `id`; legacy puts them in `data` (camelCase) with
    # the id in `data.id`. The `superwall_version` header is 2 for V2 and 1 for legacy.
    legacy = request.headers.get("superwall_version") == "1" or (
        not event.get("event_data") and event.get("object") == "event"
    )
    event_type = event.get("type")
    facts = event.get("data" if legacy else "event_data")
    if not isinstance(facts, dict):
        facts = {}
    event_id = facts.get("id") if legacy else event.get("id")
    period_type = facts.get("periodType" if legacy else "period_type")
    product_id = facts.get("productId" if legacy else "product_id")
    # `evt_...` ids (V2) are stable across redelivery: use them to deduplicate. Deliveries are
    # at least once and unordered, so order by `occurred_at` (V2) rather than by arrival.
    print(f"Received Superwall webhook {event_id} ({'legacy' if legacy else 'V2'}): {event_type}")

    if event_type == "initial_purchase":
        print(f"{'Trial started' if period_type == 'TRIAL' else 'Subscription started'}: {product_id} {event.get('app_user_id')}")
    elif event_type == "renewal":
        print(f"Renewal: {product_id} trial conversion: {facts.get('isTrialConversion' if legacy else 'is_trial_conversion')}")
    elif event_type == "non_renewing_purchase":
        print(f"One-time purchase: {product_id} {facts.get('price')}")
    elif event_type == "product_change":
        print(f"Product change: {product_id} -> {facts.get('newProductId' if legacy else 'new_product_id')}")
    elif event_type == "cancellation":
        # Auto-renew turned off; access continues until expiry. Legacy refunds arrive as a
        # cancellation with isRefund true; V2 sends a separate `refund` event.
        print(f"Cancellation: {product_id} {facts.get('cancelReason' if legacy else 'cancel_reason')}")
    elif event_type == "uncancellation":
        print(f"Auto-renew turned back on: {product_id}")
    elif event_type == "refund":
        # price and proceeds are negative
        print(f"Refund: {product_id} {facts.get('price')} {facts.get('proceeds')}")
    elif event_type == "billing_issue":
        print(f"Billing issue, subscription at risk: {product_id}")
    elif event_type == "subscription_paused":
        print(f"Subscription paused (Google Play): {product_id}")
    elif event_type == "subscription_extended":
        print(f"Subscription extended by the store: {product_id} {facts.get('expirationAt' if legacy else 'expiration_at')}")
    elif event_type == "expiration":
        print(f"Subscription expired: {product_id} {facts.get('expirationReason' if legacy else 'expiration_reason')}")
    elif event_type == "transferred":
        # Reserved for ownership changes; documented as not sent yet
        print(f"Subscription transferred: {product_id}")
    else:
        # Return 2xx for events you don't handle, or Superwall keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
