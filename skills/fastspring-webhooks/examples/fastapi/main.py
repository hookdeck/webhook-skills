# Generated with: fastspring-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

fastspring_secret = os.environ.get("FASTSPRING_WEBHOOK_SECRET")


def verify_fastspring_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a FastSpring webhook signature.

    FastSpring signs the exact raw request body with HMAC-SHA256 keyed on your
    per-webhook "HMAC SHA256 Secret", base64-encodes the digest, and sends it in
    the X-FS-Signature header. Verify once against the whole raw body.
    """
    if not signature_header:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(signature_header, expected)


def handle_event(event: dict) -> None:
    """Dispatch a single FastSpring event based on its `type`."""
    event_type = event.get("type")
    event_id = event.get("id")

    if event_type == "order.completed":
        print(f"Order completed: {event_id}")
        # Your code: Provision access, fulfill, send receipt, etc.

    elif event_type == "order.failed":
        print(f"Order failed: {event_id}")
        # Your code: Alert, retry payment flow, etc.

    elif event_type == "order.canceled":
        print(f"Order canceled: {event_id}")
        # Your code: Revoke provisional access, etc.

    elif event_type == "subscription.activated":
        print(f"Subscription activated: {event_id}")
        # Your code: Grant access, start entitlement, etc.

    elif event_type == "subscription.charge.completed":
        print(f"Subscription charge completed: {event_id}")
        # Your code: Extend entitlement, record revenue, etc.

    elif event_type == "subscription.charge.failed":
        print(f"Subscription charge failed: {event_id}")
        # Your code: Start dunning, notify customer, etc.

    elif event_type == "subscription.updated":
        print(f"Subscription updated: {event_id}")
        # Your code: Sync plan/quantity changes, etc.

    elif event_type == "subscription.canceled":
        print(f"Subscription canceled: {event_id}")
        # Your code: Schedule end-of-term downgrade, etc.

    elif event_type == "subscription.deactivated":
        print(f"Subscription deactivated: {event_id}")
        # Your code: Revoke access, etc.

    elif event_type == "return.created":
        print(f"Return created: {event_id}")
        # Your code: Reverse entitlement, adjust revenue, etc.

    else:
        print(f"Unhandled event type: {event_type} ({event_id})")


@app.post("/webhooks/fastspring")
async def fastspring_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-fs-signature")

    # Verify the signature once against the whole raw body
    if not verify_fastspring_webhook(raw_body, signature, fastspring_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    events = payload.get("events", [])
    if not isinstance(events, list):
        events = []

    # Each POST batches multiple events - iterate and dispatch on each type.
    # Dedupe on event["id"]: automatic retries reuse the same id.
    for event in events:
        handle_event(event)

    # Return 200 to mark every event in the batch processed (any status other than 200 or 202 is retried)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
