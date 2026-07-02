# Generated with: square-webhooks skill
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

signature_key = os.environ.get("SQUARE_WEBHOOK_SIGNATURE_KEY", "")
# The notification URL is part of the signed content, so it must match the URL
# registered on your Square webhook subscription exactly.
notification_url = os.environ.get("SQUARE_WEBHOOK_URL", "")


def verify_square_signature(
    raw_body: bytes, signature: str, key: str, url: str
) -> bool:
    """Verify a Square webhook signature.

    Square signs base64(HMAC-SHA256(notificationUrl + rawBody)) with the
    subscription's signature key. Square also ships a Python helper
    (``is_valid_webhook_event_signature``); this manual implementation avoids the
    extra dependency and makes the algorithm explicit.
    """
    if not signature or not key or not url:
        return False

    # Signed content is the notification URL + the raw request body.
    payload = url.encode("utf-8") + raw_body
    digest = hmac.new(key.encode("utf-8"), payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")

    # Constant-time comparison prevents timing attacks.
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/square")
async def square_webhook(request: Request):
    # Read the raw body for signature verification - do not parse JSON first.
    raw_body = await request.body()
    signature = request.headers.get("x-square-hmacsha256-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    if not verify_square_signature(raw_body, signature, signature_key, notification_url):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after the signature is verified.
    event = json.loads(raw_body)
    event_type = event.get("type")
    event_id = event.get("event_id")
    data = event.get("data", {})

    print(f"Received Square event {event_type} ({event_id})")

    # Handle the event based on its type.
    if event_type == "payment.created":
        print(f"Payment created: {data.get('id')}")
        # TODO: Record the sale, start fulfillment, etc.

    elif event_type == "payment.updated":
        print(f"Payment updated: {data.get('id')}")
        # TODO: Confirm capture, reconcile ledgers, etc.

    elif event_type == "refund.created":
        print(f"Refund created: {data.get('id')}")
        # TODO: Update order status, notify customer, etc.

    elif event_type == "refund.updated":
        print(f"Refund updated: {data.get('id')}")
        # TODO: Reconcile refunds when completed, etc.

    elif event_type == "invoice.payment_made":
        print(f"Invoice payment made: {data.get('id')}")
        # TODO: Mark invoice paid, send receipt, etc.

    elif event_type == "order.created":
        print(f"Order created: {data.get('id')}")
        # TODO: Sync to inventory / OMS, etc.

    elif event_type == "order.updated":
        print(f"Order updated: {data.get('id')}")
        # TODO: Update fulfillment, sync line items, etc.

    elif event_type == "customer.created":
        print(f"Customer created: {data.get('id')}")
        # TODO: CRM sync, welcome email, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx promptly to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
