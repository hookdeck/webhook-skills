# Generated with: guesty-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Guesty Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/guesty")
async def guesty_webhook(
    request: Request,
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    """Receive a Guesty webhook (delivered by Svix) and verify it with the svix SDK."""
    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(
            status_code=400,
            detail="Missing required webhook headers (svix-id, svix-timestamp, svix-signature)",
        )

    secret = os.environ.get("GUESTY_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body — never a re-serialized payload.
    body = await request.body()
    try:
        # The SDK decodes the whsec_ secret, checks every v1 signature in
        # constant time, and enforces a 5-minute timestamp tolerance. As of
        # svix 2.x it returns None, so the payload is parsed below.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Invalid timestamp" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Guesty puts the event name in `event` (not `type`). Deduplicate on
    # svix-id and meta.eventId (when present) before doing real work.
    event_name = event.get("event")
    meta = event.get("meta") or {}
    print(f"Received Guesty webhook: {event_name} (svix-id={svix_id}, eventId={meta.get('eventId')})")

    if event_name == "reservation.created.v2":
        print(f"Reservation created: {(event.get('data') or {}).get('reservationId')}")
    elif event_name == "reservation.updated.v2":
        print(
            f"Reservation updated: {(event.get('data') or {}).get('reservationId')} "
            f"changedFields={meta.get('changedFields')} subType={meta.get('subType')}"
        )
    elif event_name == "reservation.new":
        print(f"Reservation created (legacy): {(event.get('reservation') or {}).get('_id')}")
    elif event_name == "reservation.updated":
        print(f"Reservation updated (legacy): {(event.get('reservation') or {}).get('_id')}")
    elif event_name == "listing.new":
        print(f"Listing created: {(event.get('listing') or {}).get('_id')}")
    elif event_name == "listing.updated":
        print(f"Listing updated: {(event.get('listing') or {}).get('_id')}")
    elif event_name == "listing.removed":
        print(f"Listing removed: {(event.get('listing') or {}).get('_id')}")
    elif event_name == "guest.created":
        print(f"Guest created: {(event.get('guest') or {}).get('_id')}")
    elif event_name == "payments.received":
        payment = event.get("payment") or {}
        print(
            f"Payment received: reservation={payment.get('reservationId')} "
            f"{payment.get('amount')} {payment.get('currency')}"
        )
    else:
        print(f"Unhandled event: {event_name}")

    # Respond quickly (Guesty expects 2xx within ~15s); fetch fresh data from
    # the Open API asynchronously if you need the full object.
    return {"received": True, "event": event_name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
