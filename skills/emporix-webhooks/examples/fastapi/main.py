# Generated with: emporix-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Emporix Webhook Handler")


def get_event_type(body: Any, query_event_type: Optional[str]) -> Optional[str]:
    """Return the event type.

    Emporix documents each event's payload schema but not an envelope, and Svix
    sends no event-type header. Use `eventType` from the body if present,
    otherwise from the `?eventType=` query string on the endpoint URL registered
    in the Svix dashboard.
    """
    if isinstance(body, dict) and isinstance(body.get("eventType"), str):
        return body["eventType"]
    return query_event_type


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/emporix")
async def emporix_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("EMPORIX_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("EMPORIX_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body (any content type): the exact bytes Svix signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces a fixed 5-minute timestamp window.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Emporix webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = get_event_type(body, request.query_params.get("eventType"))
    data = body if isinstance(body, dict) else {}
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Emporix webhook {svix_id}: {event_type or '(unknown event type)'}")

    if event_type == "order.created":
        print(f"Order created: {data.get('id')} {data.get('status')}")
    elif event_type == "order.updated":
        print(f"Order updated: {data.get('id')} {data.get('status')}")
    elif event_type == "customer.created":
        print(f"Customer created: {data.get('customerNumber')} {data.get('contactEmail')}")
    elif event_type == "product.created":
        print(f"Product created: {data.get('id')} {data.get('code')}")
    elif event_type == "product.updated":
        print(f"Product updated: {data.get('id')} {data.get('code')}")
    elif event_type is None:
        # No event type available: register one Svix endpoint per event with ?eventType=...
        print(f"Event type unknown; payload keys: {list(data)}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "eventType": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
