# Generated with: commercelayer-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib
import base64

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

shared_secret = os.environ.get("COMMERCELAYER_SHARED_SECRET")


def verify_commercelayer_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify a Commerce Layer webhook signature.

    Commerce Layer signs the RAW request body with HMAC-SHA256 keyed on the
    webhook's shared_secret and sends the digest as base64 in the
    X-CommerceLayer-Signature header.
    """
    if not signature:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/commercelayer")
async def commercelayer_webhook(request: Request):
    # Read the RAW body BEFORE parsing so the signature matches byte-for-byte.
    raw_body = await request.body()
    signature = request.headers.get("x-commercelayer-signature")
    topic = request.headers.get("x-commercelayer-topic")

    # Verify first — reject anything that isn't authentic.
    if not verify_commercelayer_signature(raw_body, signature, shared_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Safe to parse only after verification. Payload is JSON:API.
    payload = json.loads(raw_body)
    resource = payload.get("data", {})
    resource_id = resource.get("id")

    print(f"Received {topic} webhook for {resource.get('type')} {resource_id}")

    # Dispatch on the topic ({resource}.{trigger}).
    if topic == "orders.place":
        print(f"Order placed: {resource_id}")
        # Your code: Start fulfillment, notify ops, etc.

    elif topic == "orders.approve":
        print(f"Order approved: {resource_id}")
        # Your code: Trigger downstream processing.

    elif topic == "orders.cancel":
        print(f"Order cancelled: {resource_id}")
        # Your code: Release stock, reverse workflows.

    elif topic == "orders.pay":
        print(f"Order paid: {resource_id}")
        # Your code: Record revenue, kick off fulfillment.

    elif topic == "orders.refund":
        print(f"Order refunded: {resource_id}")
        # Your code: Update accounting, notify customer.

    elif topic == "customers.create":
        print(f"Customer created: {resource_id}")
        # Your code: CRM sync, welcome email.

    elif topic == "shipments.ship":
        print(f"Shipment shipped: {resource_id}")
        # Your code: Send tracking, update order status.

    elif topic == "shipments.deliver":
        print(f"Shipment delivered: {resource_id}")
        # Your code: Close order, request a review.

    else:
        print(f"Unhandled topic: {topic}")

    # Acknowledge quickly (Commerce Layer requires a 2xx within 5 seconds).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
