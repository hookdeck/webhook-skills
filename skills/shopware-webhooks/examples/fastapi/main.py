import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def get_shop_secret(shop_id: str) -> Optional[str]:
    """Look up the app secret for a shop.

    Each shop has its own secret, assigned during the registration handshake.
    Replace with a database lookup in production.
    """
    try:
        secrets = json.loads(os.environ.get("SHOPWARE_APP_SECRETS") or "{}")
        if secrets.get(shop_id):
            return secrets[shop_id]
    except (json.JSONDecodeError, AttributeError):
        pass  # fall through to the single-secret fallback
    return os.environ.get("SHOPWARE_APP_SECRET") or None


def verify_shopware_webhook(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify Shopware webhook signature (hex HMAC-SHA256 of the raw body)."""
    if not signature or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature.encode(), expected_signature.encode())


@app.post("/webhooks/shopware")
async def shopware_webhook(request: Request):
    # Get the raw body for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("shopware-shop-signature")

    # Parse only to find which shop sent this; nothing is trusted until verified
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    source = payload.get("source") if isinstance(payload, dict) else None
    shop_id = source.get("shopId") if isinstance(source, dict) else None
    if not shop_id:
        raise HTTPException(status_code=400, detail="Missing source.shopId")

    if not verify_shopware_webhook(raw_body, signature, get_shop_secret(shop_id)):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = payload.get("data") or {}
    event = data.get("event")
    event_id = source.get("eventId")  # stable across retries: use for idempotency
    event_payload = data.get("payload")

    print(f"Received {event} event from shop {shop_id} (eventId: {event_id})")

    if event == "checkout.order.placed":
        print(f"Order placed: {json.dumps(event_payload)}")
        # TODO: Fulfilment, ERP sync, etc.

    elif event == "product.written":
        print(f"Product written: {json.dumps(event_payload)}")
        # TODO: Fetch the product by primaryKey via the Admin API and sync it

    elif event == "order.written":
        print(f"Order written: {json.dumps(event_payload)}")
        # TODO: Fetch the order by primaryKey and sync it

    elif event == "customer.written":
        print(f"Customer written: {json.dumps(event_payload)}")
        # TODO: Fetch the customer by primaryKey and sync to CRM

    elif event == "state_enter.order.state.completed":
        print(f"Order completed: {json.dumps(event_payload)}")
        # TODO: Send notifications, invoicing, etc.

    elif event == "state_enter.order_transaction.state.paid":
        print(f"Order transaction paid: {json.dumps(event_payload)}")
        # TODO: Release goods, mark as paid, etc.

    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
