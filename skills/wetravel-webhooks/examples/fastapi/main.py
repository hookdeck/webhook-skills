# Generated with: wetravel-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="WeTravel Webhook Handler")

HANDLED_EVENTS = {
    "booking.created": "Booking created",
    "booking.updated": "Booking updated",
    "payment.created": "Payment created",
    "payment.updated": "Payment updated",
    "transaction.created": "Transaction created",
    "transaction.updated": "Transaction updated",
    "trip.published": "Trip published",
    "lead.created": "Lead created",
    "lead.updated": "Lead updated",
}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/wetravel")
async def wetravel_webhook(
    request: Request,
    # WeTravel delivers through Svix (svix-* headers). Accept the Standard
    # Webhooks webhook-* names too — the signing scheme is identical.
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
    webhook_id: Optional[str] = Header(None),
    webhook_timestamp: Optional[str] = Header(None),
    webhook_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("WETRAVEL_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id = svix_id or webhook_id
    timestamp = svix_timestamp or webhook_timestamp
    signature = svix_signature or webhook_signature
    if not all([msg_id, timestamp, signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body — never a re-serialized payload.
    body = await request.body()
    try:
        # HMAC-SHA256 over f"{id}.{timestamp}.{raw_body}" with the base64 key
        # after whsec_; checks every v1 signature and a 5-minute timestamp window.
        Webhook(secret).verify(
            body,
            {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature},
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Svix envelope: { type, data }. Check the exact payload shape for each
    # event in WeTravel's "Manage Webhooks" > Event Catalog.
    event_type = event.get("type")
    data = event.get("data") or {}
    print(f"Received WeTravel webhook: {event_type} ({msg_id})")

    if event_type in HANDLED_EVENTS:
        print(f"{HANDLED_EVENTS[event_type]}: {data.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
