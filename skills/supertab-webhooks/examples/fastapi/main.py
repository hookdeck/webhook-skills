# Generated with: supertab-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Supertab Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/supertab")
async def supertab_webhook(request: Request):
    secret = os.environ.get("SUPERTAB_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("SUPERTAB_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Supertab (Svix) signed
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
        print(f"Supertab webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `type`, the payload is under `data`. The name carries a version
    # suffix (`purchase.completed_2025-04-01`), but the catalog's own purchase.completed example
    # omits it, so strip the suffix and match on the base name. There is no event id in the body.
    raw_type = event.get("type")
    event_type = re.sub(r"_\d{4}-\d{2}-\d{2}$", "", raw_type) if isinstance(raw_type, str) else None
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}
    # `svix-id` is stable across retries of the same message: use it to deduplicate
    print(f"Received Supertab webhook {msg_id}: {raw_type}")

    if event_type == "purchase.completed":
        # data: id, offering_id, description, price, user, metadata, entitlement_status, purchased_at, completed_at
        user = data.get("user") or {}
        price = data.get("price") or {}
        print(f"Purchase completed: {data.get('id')} {data.get('offering_id')} {user.get('email')} {price.get('amount')}")
    elif event_type == "onetime_offering.purchasing_completed":
        # data: id, status, metadata, price, items[] (each item has its own metadata and purchase)
        # Check `metadata` here before granting access to what the offering represents
        print(f"One-Time Offering purchased: {data.get('id')} {data.get('status')} {data.get('metadata')}")
    else:
        # Return 2xx for events you don't handle, or Supertab keeps retrying them
        print(f"Unhandled event type: {raw_type}")

    return {"success": True, "type": raw_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
