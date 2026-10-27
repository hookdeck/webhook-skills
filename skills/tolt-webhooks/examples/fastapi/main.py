# Generated with: tolt-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Tolt Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/tolt")
async def tolt_webhook(request: Request):
    secret = os.environ.get("TOLT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TOLT_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Tolt (Svix) signed
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
        print(f"Tolt webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every delivery is {type, data, timestamp}. `data` is the API resource plus
    # organization_id; money fields are strings in cents ("980"), so parse before doing math
    event_type = event.get("type")
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}
    # The body has no event id: the svix-id header is stable across retries, so deduplicate on it.
    # Order is not guaranteed either: keep the newest version by data.updated_at
    print(f"Received Tolt webhook {msg_id}: {event_type}")

    if event_type == "partner.created":
        print(f"Partner joined: {data.get('id')}")
    elif event_type == "partner.updated":
        # Also fires when a partner is approved, rejected or suspended
        print(f"Partner updated: {data.get('id')} {data.get('status')}")
    elif event_type == "link.created":
        print(f"Referral link created: {data.get('id')}")
    elif event_type == "link.updated":
        print(f"Referral link updated: {data.get('id')}")
    elif event_type == "customer.created":
        print(f"Referred customer signed up: {data.get('id')} {data.get('partner_id')}")
    elif event_type == "customer.updated":
        print(f"Customer updated: {data.get('id')} {data.get('status')}")
    elif event_type == "transaction.created":
        print(f"Transaction recorded: {data.get('id')} {data.get('amount')} {data.get('currency')}")
    elif event_type == "transaction.updated":
        # Edited or refunded: read the status from the payload
        print(f"Transaction updated: {data.get('id')} {data.get('status')}")
    elif event_type == "commission.created":
        print(f"Commission earned: {data.get('id')} {data.get('partner_id')} {data.get('amount')} {data.get('currency')}")
    elif event_type == "commission.updated":
        # Approved, declined or edited
        print(f"Commission updated: {data.get('id')} {data.get('status')}")
    else:
        # Return 200 for events you don't handle, or Tolt keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
