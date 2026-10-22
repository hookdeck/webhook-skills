# Generated with: printify-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="


def verify_printify_signature(raw_body: bytes, header: str, secret: str) -> bool:
    """Verify X-Pfy-Signature: "sha256=<hex HMAC-SHA256 of the raw body>".

    The secret is used as a UTF-8 string (not base64-decoded).
    """
    if not header.startswith(SIGNATURE_PREFIX):
        return False
    received = header[len(SIGNATURE_PREFIX):].strip()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest is timing-safe; different lengths simply compare unequal
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/printify")
async def printify_webhook(request: Request):
    secret = os.getenv("PRINTIFY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Server configuration error")

    signature = request.headers.get("x-pfy-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Pfy-Signature header")

    # IMPORTANT: use the raw bytes, whatever the Content-Type; don't parse JSON first
    raw_body = await request.body()

    if not verify_printify_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Envelope: { id, type, created_at, resource: { id, type, data } }
    # Dedupe on event["id"] (see webhook-handler-patterns); Printify retries 4xx/5xx up to 3 times.
    event_type = event.get("type")
    resource = event.get("resource") or {}
    data = resource.get("data") or {}
    print(f"Received Printify webhook: {event_type} ({event.get('id')})")

    if event_type == "order:created":
        print("Order created:", resource.get("id"))
        # TODO: no data is sent; fetch the order via the API
    elif event_type == "order:updated":
        print("Order updated:", resource.get("id"), data.get("status"))
        # TODO: sync production status
    elif event_type == "order:line-item:canceled":
        print("Line item canceled:", resource.get("id"), data.get("line_item_id"), data.get("status_details"))
        # TODO: notify the customer / restock
    elif event_type == "order:sent-to-production":
        print("Order sent to production:", resource.get("id"))
        # TODO: mark the order as in production
    elif event_type == "order:shipment:created":
        print("Shipment created:", resource.get("id"), (data.get("carrier") or {}).get("tracking_number"))
        # TODO: email tracking details
    elif event_type == "order:shipment:delivered":
        print("Shipment delivered:", resource.get("id"), data.get("delivered_at"))
        # TODO: mark delivered
    elif event_type in ("product:created", "product:updated"):
        print(f"Product {event_type.split(':')[1]}:", resource.get("id"))
        # TODO: sync the product
    elif event_type == "product:publish:started":
        print("Product publish started:", resource.get("id"), data.get("action"))
        # TODO: publish to your storefront, then confirm via the API
    elif event_type == "product:deleted":
        print("Product deleted:", resource.get("id"))
        # TODO: remove the product from your catalog
    elif event_type == "shop:disconnected":
        print("Shop disconnected:", resource.get("id"))
        # TODO: stop syncing this shop
    elif event_type == "personalization-preview-task:processed":
        print("Personalization preview processed:", data.get("task_id"), data.get("status"))
        # TODO: fetch mockups on completed, retry on failed
    else:
        print("Unhandled Printify event:", event_type)

    return {"received": True, "type": event_type}
