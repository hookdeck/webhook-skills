# Generated with: globalstack-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="GlobalStack Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/globalstack")
async def globalstack_webhook(request: Request):
    secret = os.environ.get("GLOBALSTACK_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("GLOBALSTACK_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes GlobalStack (Svix) signed
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
        print(f"GlobalStack webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Flat envelope: the event name is the top-level `event_type`, and the resource
    # (the REST body plus event-only fields) is in `event_object`
    event_type = event.get("event_type")
    obj = event.get("event_object") if isinstance(event.get("event_object"), dict) else {}
    object_id = event.get("event_object_id")
    # `event_id` is stable across retries (and equals svix-id without `msg_`): use it to deduplicate.
    # Deliveries are not ordered: judge state by `event_object_status`, not by which event arrived last.
    print(f"Received GlobalStack webhook {event.get('event_id')}: {event_type} ({object_id} -> {event.get('event_object_status')})")

    if event_type == "onramp.awaiting_deposit":
        # Show the payer the deposit instructions
        print(f"Onramp awaiting deposit: {object_id} {obj.get('deposit_instruction')}")
    elif event_type in ("onramp.funds_received", "offramp.funds_received", "conversion.funds_received"):
        # The money is in, but work has not finished: wait for success, failed or returned
        print(f"Funds received: {event_type} {object_id}")
    elif event_type in ("onramp.processing", "offramp.processing", "conversion.processing", "transfer.processing"):
        print(f"In flight: {event_type} {object_id}")
    elif event_type in ("offramp.created", "conversion.created"):
        print(f"Created: {event_type} {object_id}")
    elif event_type in ("onramp.success", "offramp.success", "conversion.success"):
        # Reconcile against actual_*, not the quoted rate and amounts
        print(f"Succeeded: {event_type} {object_id} {obj.get('actual_source_amount')} "
              f"{obj.get('actual_destination_amount')} {obj.get('actual_rate')}")
    elif event_type in ("onramp.failed", "offramp.failed", "conversion.failed", "transfer.failed"):
        # failure_reason tells quote_expired apart from a genuine failure (or a cancelled/reversed transfer)
        print(f"Failed: {event_type} {object_id} {obj.get('failure_reason')}")
    elif event_type in ("onramp.returned", "offramp.returned", "conversion.returned"):
        # Funds went back to their origin; failure_reason is "returned"
        print(f"Returned: {event_type} {object_id} {obj.get('failure_reason')}")
    elif event_type == "transfer.success":
        print(f"Transfer succeeded: {object_id} {obj.get('amount')} {obj.get('currency')}")
    elif event_type == "deposit.received":
        # Seen but not final; a cross-currency deposit stays here and its conversion.* events carry the outcome
        print(f"Deposit received: {object_id}")
    elif event_type == "deposit.held":
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        print(f"Deposit held: {object_id} {metadata.get('hold_reason')}")
    elif event_type == "deposit.confirmed":
        print(f"Deposit confirmed: {object_id} {obj.get('destination_amount')}")
    elif event_type == "deposit.failed":
        print(f"Deposit failed: {object_id}")
    elif event_type == "kyc.approved":
        customer = obj.get("customer") if isinstance(obj.get("customer"), dict) else {}
        print(f"KYC approved: {object_id} {customer.get('tier')}")
    elif event_type == "kyc.rejected":
        print(f"KYC rejected: {object_id} {obj.get('failure_reason')}")
    else:
        # Return 200 for events you don't handle, or GlobalStack keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
