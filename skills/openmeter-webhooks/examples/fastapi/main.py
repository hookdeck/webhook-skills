# Generated with: openmeter-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="OpenMeter Webhook Handler")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/openmeter")
async def openmeter_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("OPENMETER_WEBHOOK_SECRET")
    if not secret:
        print("OPENMETER_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(
            status_code=400,
            detail="Missing svix-id, svix-timestamp or svix-signature header",
        )

    # Read the RAW body - the signature covers these exact bytes
    payload = await request.body()

    # Verify with the svix SDK: HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}",
    # keyed with the base64-decoded secret, plus a 5-minute timestamp tolerance.
    try:
        Webhook(secret).verify(
            payload,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"OpenMeter webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Verified - now it is safe to parse the { id, timestamp, type, data } envelope
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "entitlements.balance.threshold":
        print(
            "Entitlement threshold reached:",
            {
                "subject": (data.get("subject") or {}).get("key"),
                "feature": (data.get("feature") or {}).get("key"),
                "threshold": data.get("threshold"),
                "usage": (data.get("value") or {}).get("usage"),
            },
        )
        # TODO: notify the customer, or block access at 100%
    elif event_type == "entitlements.reset":
        print(
            "Entitlement reset:",
            {
                "subject": (data.get("subject") or {}).get("key"),
                "feature": (data.get("feature") or {}).get("key"),
            },
        )
        # TODO: clear over-quota flags, restore access
    elif event_type == "invoice.created":
        print("Invoice created:", {"id": data.get("id"), "status": data.get("status")})
        # TODO: sync the invoice to your accounting system
    elif event_type == "invoice.updated":
        print("Invoice updated:", {"id": data.get("id"), "status": data.get("status")})
        # TODO: react to the new invoice state
    else:
        print(f"Unhandled OpenMeter event type: {event_type}")

    # Acknowledge quickly; OpenMeter (via Svix) retries non-2xx responses
    return {"received": True, "id": event.get("id"), "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
