import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_fourthwall_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Fourthwall shop webhook signature.

    The header is base64(HMAC-SHA256(secret, raw body)); there is no timestamp.
    """
    if not signature_header or not secret:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected.encode(), signature_header.encode())


async def verified_event(request: Request) -> dict:
    """Dependency: read the raw body, verify the signature, then parse the event."""
    raw_body = await request.body()
    signature = request.headers.get("x-fourthwall-hmac-sha256")

    if not verify_fourthwall_signature(raw_body, signature, os.environ.get("FOURTHWALL_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")


@app.post("/webhooks/fourthwall")
async def fourthwall_webhook(event: dict = Depends(verified_event)):
    event_type = event.get("type")
    data = event.get("data") or {}
    print(f"Received {event_type} ({event.get('id')})" + (" [test]" if event.get("testMode") else ""))

    # Handle the event based on type. Delivery is at-least-once,
    # so deduplicate on event["id"] before doing real work.
    if event_type == "ORDER_PLACED":
        print(f"New order: {data.get('friendlyId')}")
        # TODO: Start fulfilment, record the sale, etc.

    elif event_type == "ORDER_UPDATED":
        print(f"Order updated: {(data.get('order') or {}).get('friendlyId')}")
        # TODO: Sync order status or shipping address

    elif event_type == "GIFT_PURCHASE":
        print(f"Gift purchase: {data.get('friendlyId')}")
        # TODO: Deliver or track gift redemptions

    elif event_type == "DONATION":
        print(f"Donation from: {data.get('username')}")
        # TODO: Send thanks, trigger a stream alert, etc.

    elif event_type == "SUBSCRIPTION_PURCHASED":
        print(f"New subscription: {data.get('id')}")
        # TODO: Grant membership access

    elif event_type == "SUBSCRIPTION_CHANGED":
        print(f"Subscription changed: {data.get('id')}")
        # TODO: Update entitlements for the new tier

    elif event_type == "SUBSCRIPTION_EXPIRED":
        print(f"Subscription expired: {data.get('id')}")
        # TODO: Revoke membership access

    elif event_type == "PRODUCT_CREATED":
        print(f"Product created: {data.get('name')}")
        # TODO: Add to external catalog

    elif event_type == "PRODUCT_UPDATED":
        print(f"Product updated: {data.get('name')}")
        # TODO: Update external catalog

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 quickly (Fourthwall expects a reply within 2 seconds)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
