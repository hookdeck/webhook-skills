# Generated with: runa-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Runa Webhook Handler")

# product.update events can arrive out of order: keep the newest timestamp per product
# (in-memory for the example; use your database in production)
last_product_update: dict = {}


def detect_event(payload):
    """Runa bodies are bare resources with no event-type field. Each Svix endpoint subscribes
    to a single event type, so identify the event from the payload shape."""
    if not isinstance(payload, dict):
        return None
    if "product_code" in payload and "new_state" in payload:
        return "product.update"
    if payload.get("status") in ("COMPLETED", "FAILED"):
        return "order.completion"
    return None


def parse_timestamp(value):
    """ISO 8601 timestamp -> aware datetime, or None when missing/unparseable."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/runa")
async def runa_webhook(request: Request):
    secret = os.environ.get("RUNA_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("RUNA_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Runa (Svix) signed
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
        print(f"Runa webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = detect_event(event)
    ignored = None

    if event_type == "order.completion":
        # The `status` field says which of the two payloads this is
        if event.get("status") == "COMPLETED":
            # Full order summary: safe to fulfil after reconciling with the Orders API
            print(f"Order completed: {event.get('id')} {event.get('completed_at')} "
                  f"{event.get('currency')} {event.get('total_price')}")
        else:
            # Failed orders carry only {id, status: "FAILED"}: look the order up for details
            print(f"Order failed: {event.get('id')}")
    elif event_type == "product.update":
        # Delivery order isn't guaranteed: discard events older than the last one seen
        sent_at = parse_timestamp(event.get("timestamp"))
        product_code = event.get("product_code")
        last = last_product_update.get(product_code)
        if sent_at is not None and last is not None and sent_at < last:
            print(f"Ignoring stale product update: {product_code} {event.get('timestamp')}")
            ignored = "stale"
        else:
            if sent_at is not None:
                last_product_update[product_code] = sent_at
            before = event.get("old_state") if isinstance(event.get("old_state"), dict) else {}
            after = event.get("new_state") if isinstance(event.get("new_state"), dict) else {}
            if before.get("is_orderable") != after.get("is_orderable"):
                # False: disable the product (orders for it are rejected); True: enable it again
                print(f"Product orderability changed: {product_code} {after.get('is_orderable')}")
            if before.get("price_multiplier") != after.get("price_multiplier"):
                print(f"Product price multiplier changed: {product_code} {after.get('price_multiplier')}")
    else:
        # Return 200 for payloads you don't handle, or Svix keeps retrying them
        print("Unhandled Runa payload")

    result = {"received": True, "event": event_type}
    if ignored:
        result["ignored"] = ignored
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
