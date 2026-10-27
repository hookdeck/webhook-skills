# Generated with: nomod-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Nomod Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/nomod")
async def nomod_webhook(request: Request):
    secret = os.environ.get("NOMOD_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("NOMOD_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Nomod (Svix) signed
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
        print(f"Nomod webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Body: {type, eventId, objectId, data}. `type` is the event name, `objectId` the charge
    # (ch_...) and `data` the full charge. Do not confuse it with data.events[].type, which is
    # the charge's own history ("completed").
    event_type = event.get("type")
    event_id = event.get("eventId")
    object_id = event.get("objectId")
    charge = event.get("data") if isinstance(event.get("data"), dict) else {}
    # `eventId` is stable across redeliveries: use it to ignore repeated deliveries.
    print(f"Received Nomod webhook {event_id}: {event_type} ({object_id} -> {charge.get('status')})")

    if event_type == "charge.created":
        # A payment object exists and is awaiting customer action
        print(f"Charge created: {object_id} {charge.get('total')} {charge.get('currency')}")
    elif event_type == "charge.authorised":
        # Funds are reserved on the customer's card, awaiting capture
        print(f"Charge authorised: {object_id} {charge.get('total')} {charge.get('currency')}")
    elif event_type == "charge.completed":
        # Funds captured and settled: fulfil the order
        print(f"Charge completed: {object_id} {charge.get('total')} {charge.get('currency')} {charge.get('referenceId')}")
    elif event_type == "charge.failed":
        # Declined at authorisation or capture
        print(f"Charge failed: {object_id} {charge.get('error')}")
    elif event_type == "charge.cancelled":
        # The authorisation was voided before capture
        print(f"Charge cancelled: {object_id}")
    elif event_type == "charge.refunded":
        print(f"Charge refunded: {object_id} {charge.get('refundTotal')} {charge.get('currency')}")
    elif event_type == "charge.partially_refunded":
        # The remaining amount stays settled
        print(f"Charge partially refunded: {object_id} {charge.get('refundTotal')} {charge.get('currency')}")
    elif event_type == "charge.dispute.created":
        # A chargeback or dispute was opened by the customer
        print(f"Dispute created: {object_id}")
    else:
        # Return 200 for events you don't handle, or Nomod keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
