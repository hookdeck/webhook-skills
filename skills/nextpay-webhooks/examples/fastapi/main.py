# Generated with: nextpay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="NextPay Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/nextpay")
async def nextpay_webhook(request: Request):
    secret = os.environ.get("NEXTPAY_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("NEXTPAY_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes NextPay (Svix) signed
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
        print(f"NextPay webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Two body shapes: v2.* payment events are {event, payload}; payout and platform events are {type, data}
    # (NextPay's own guide reads `event.event || event.type`)
    event_type = event.get("event") or event.get("type")
    body = event.get("payload") if isinstance(event.get("payload"), dict) else event.get("data")
    obj = body if isinstance(body, dict) else {}
    # `svix-id` is stable across retries and replays: use it (or the event's `id`) to deduplicate.
    # Ordering is not documented, so judge state by the resource's `status`, not by arrival order.
    print(f"Received NextPay webhook {msg_id}: {event_type}")

    if event_type == "v2.payment_intent.succeeded":
        # Payment received and settled: fulfil the order via payload.external_id
        print(f"Payment intent succeeded: {obj.get('id')} {obj.get('external_id')} {obj.get('amount')}")
    elif event_type == "v2.payment_intent.canceled":
        print(f"Payment intent canceled: {obj.get('id')} {obj.get('external_id')}")
    elif event_type == "v2.payment_instrument.used":
        # A single-use Funding Method instrument was used
        print(f"Payment instrument used: {obj.get('id')}")
    elif event_type == "v2.payment_instrument.payment_received":
        # Incoming payment received on a Funding Method, not yet cleared
        print(f"Payment received: {obj.get('id')} {obj.get('amount')}")
    elif event_type == "v2.payment_instrument.payment_settled":
        print(f"Payment settled: {obj.get('id')} {obj.get('amount')}")
    elif event_type in ("payout_request.creation_failed", "payout_request.queue_failed"):
        print(f"Payout request failed: {event_type} {obj.get('id')}")
    elif event_type == "payout_request.queued":
        print(f"Payout request queued: {obj.get('id')}")
    elif event_type == "payout_request.processed":
        print(f"Payout request processed: {obj.get('id')} {obj.get('status')}")
    elif event_type in ("payout.succeeded", "payout.processed"):
        print(f"Payout delivered: {event_type} {obj.get('id')} {obj.get('amount_cents')}")
    elif event_type in ("payout.failed", "payout.processing_failed"):
        print(f"Payout failed: {event_type} {obj.get('id')}")
    elif event_type == "deposit.confirmed":
        print(f"Deposit confirmed: {obj.get('id')}")
    elif event_type == "direct_transfer.received":
        print(f"Direct transfer received: {obj.get('id')}")
    elif event_type == "legal_entity.verification_status_changed":
        # Merchant KYC/compliance status changed
        print(f"Verification status changed: {obj.get('id')} {obj.get('status')}")
    else:
        # Return 2xx for events you don't handle; 4xx is not retried but 5xx is
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
