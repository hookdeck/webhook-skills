import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

shopify_secret = os.environ.get("SHOPIFY_API_SECRET")


def verify_shopify_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    """Verify Shopify webhook signature."""
    computed_hmac = base64.b64encode(
        hmac.new(
            secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).digest()
    ).decode('utf-8')
    
    return hmac.compare_digest(computed_hmac, hmac_header)


@app.post("/webhooks/shopify")
async def shopify_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    hmac_header = request.headers.get("x-shopify-hmac-sha256")
    topic = request.headers.get("x-shopify-topic")
    shop = request.headers.get("x-shopify-shop-domain")

    # Verify webhook signature
    if not hmac_header or not verify_shopify_webhook(raw_body, hmac_header, shopify_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)

    print(f"Received {topic} webhook from {shop}")

    # Handle the event based on topic
    if topic == "orders/create":
        print(f"New order: {payload['id']}")
        # TODO: Process new order, sync to fulfillment, etc.

    elif topic == "orders/updated":
        print(f"Order updated: {payload['id']}")
        # TODO: Update order status, sync changes, etc.

    elif topic == "orders/paid":
        print(f"Order paid: {payload['id']}")
        # TODO: Trigger fulfillment, record payment, etc.

    elif topic == "products/create":
        print(f"New product: {payload['id']}")
        # TODO: Sync to external catalog, etc.

    elif topic == "products/update":
        print(f"Product updated: {payload['id']}")
        # TODO: Update external listings, etc.

    elif topic == "customers/create":
        print(f"New customer: {payload['id']}")
        # TODO: Welcome email, CRM sync, etc.

    elif topic == "app/uninstalled":
        print(f"App uninstalled from shop: {shop}")
        # TODO: Cleanup shop data, etc.

    # GDPR mandatory webhooks
    elif topic == "customers/data_request":
        print(f"Customer data request for shop: {shop}")
        # TODO: Gather and return customer data

    elif topic == "customers/redact":
        print(f"Customer redact request for shop: {shop}")
        # TODO: Delete customer data

    elif topic == "shop/redact":
        print(f"Shop redact request for shop: {shop}")
        # TODO: Delete all shop data

    else:
        print(f"Unhandled topic: {topic}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
