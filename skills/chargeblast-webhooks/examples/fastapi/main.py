# Generated with: chargeblast-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Chargeblast Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Chargeblast sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


@app.post("/webhooks/chargeblast")
async def chargeblast_webhook(request: Request):
    secret = os.environ.get("CHARGEBLAST_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("CHARGEBLAST_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id, timestamp, signature = read_signature_headers(request.headers)
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Chargeblast (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
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
    except WebhookVerificationError as err:
        print(f"Chargeblast webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body has no envelope and no type field: the event type is in the X-Event-Type header
    event_type: Optional[str] = request.headers.get("x-event-type")
    # The svix-id is stable across retries: use it to deduplicate
    print(f"Received Chargeblast webhook {msg_id}: {event_type}")

    if event_type == "alert.created":
        # externalOrder is not set yet on alert.created; wait for alert.updated if you need it
        print(f"Alert created: {payload.get('id')} {payload.get('subprovider')} {payload.get('amount')} {payload.get('currency')}")
    elif event_type == "alert.updated":
        print(f"Alert updated: {payload.get('id')} {payload.get('externalOrder')}")
    elif event_type == "alert.refunded":
        # Can follow alert.created closely when the alert arrives already resolved
        print(f"Alert refunded: {payload.get('id')} {payload.get('amount')} {payload.get('currency')}")
    elif event_type == "alert.matched":
        print(f"Alert matched to a charge: {payload.get('id')} {payload.get('externalOrder')}")
    elif event_type == "alert.will_expire":
        # Sent at most once per alert, about 46-48 hours before it expires (Ethoca and CDRN)
        print(f"Alert will expire soon: {payload.get('id')}")
    elif event_type == "alert.within_refund_rules":
        # Not deduplicated, and a later refund can still fail: handle repeats idempotently
        print(f"Alert within refund rules: {payload.get('id')}")
    elif event_type == "deflection.created":
        # Deflection body: `type` is the product (CE or FPT), not the event type
        print(f"Deflection created: {payload.get('id')} {payload.get('type')} {payload.get('status')}")
    elif event_type == "deflection.updated":
        print(f"Deflection updated: {payload.get('id')} {payload.get('status')} {payload.get('fees')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
