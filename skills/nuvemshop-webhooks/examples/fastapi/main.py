# Generated with: nuvemshop-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

nuvemshop_client_secret = os.environ.get("NUVEMSHOP_CLIENT_SECRET")


def verify_nuvemshop_webhook(raw_body: bytes, hmac_header: str, client_secret: str) -> bool:
    """Verify a Nuvemshop (Tiendanube) webhook signature.

    Nuvemshop signs the raw request body with HMAC-SHA256 keyed on the app's
    client secret and sends the digest hex-encoded in x-linkedstore-hmac-sha256.
    """
    if not hmac_header:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, hmac_header)


@app.post("/webhooks/nuvemshop")
async def nuvemshop_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    hmac_header = request.headers.get("x-linkedstore-hmac-sha256")

    # Verify webhook signature against the raw body
    if not verify_nuvemshop_webhook(raw_body, hmac_header, nuvemshop_client_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification. Payloads are thin:
    # { store_id, event, id } -- fetch the full resource via the REST API.
    payload = json.loads(raw_body)
    store_id = payload.get("store_id")
    event = payload.get("event")
    resource_id = payload.get("id")

    print(f"Received {event} for store {store_id} (resource {resource_id})")

    # Handle the event based on the resource/action event name
    if event == "order/created":
        print(f"New order: {resource_id}")
        # Your code: GET /v1/{store_id}/orders/{id}, start fulfillment, etc.

    elif event == "order/paid":
        print(f"Order paid: {resource_id}")
        # Your code: Trigger shipping, record revenue, etc.

    elif event == "order/cancelled":
        print(f"Order cancelled: {resource_id}")
        # Your code: Restock, refund workflows, etc.

    elif event == "order/updated":
        print(f"Order updated: {resource_id}")
        # Your code: Re-sync order state, etc.

    elif event == "order/fulfilled":
        print(f"Order fulfilled: {resource_id}")
        # Your code: Send tracking to customer, etc.

    elif event == "product/created":
        print(f"New product: {resource_id}")
        # Your code: Sync to external catalog, etc.

    elif event == "product/updated":
        print(f"Product updated: {resource_id}")
        # Your code: Update external listings, pricing, etc.

    elif event == "product/deleted":
        print(f"Product deleted: {resource_id}")
        # Your code: Remove from external catalog, etc.

    elif event == "customer/created":
        print(f"New customer: {resource_id}")
        # Your code: CRM sync, welcome email, etc.

    elif event == "app/uninstalled":
        print(f"App uninstalled from store: {store_id}")
        # Your code: Clean up store data, revoke tokens, etc.

    else:
        print(f"Unhandled event: {event}")

    # Return 2XX within 3 seconds to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
