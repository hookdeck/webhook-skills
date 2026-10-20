# Generated with: etsy-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Etsy Webhook Handler")

# Etsy recommends rejecting timestamps more than 300 seconds from server time
TIMESTAMP_TOLERANCE_SECONDS = 300


def compute_signature(secret: str, webhook_id: str, timestamp: str, body: bytes) -> str:
    """HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}", base64-encoded.

    The key is the signing secret with the whsec_ prefix removed, base64-decoded.
    """
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed_content = f"{webhook_id}.{timestamp}.".encode() + body
    return base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest()).decode()


def signature_matches(signature_header: str, expected: str) -> bool:
    """The header is a space-separated list of "v1,<base64>" entries; any match is valid."""
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version == "v1" and hmac.compare_digest(signature.encode(), expected.encode()):
            return True
    return False


async def verified_etsy_event(
    request: Request,
    webhook_id: Optional[str] = Header(None, alias="webhook-id"),
    webhook_timestamp: Optional[str] = Header(None, alias="webhook-timestamp"),
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature"),
) -> dict[str, Any]:
    """FastAPI dependency: verify the Etsy signature and return the parsed event."""
    secret = os.environ.get("ETSY_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(
            status_code=400,
            detail="Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)",
        )

    try:
        timestamp = int(webhook_timestamp)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook-timestamp")
    if abs(int(time.time()) - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        raise HTTPException(status_code=400, detail="Timestamp outside tolerance")

    # Raw body: verification must run on the exact bytes Etsy signed
    body = await request.body()

    try:
        expected = compute_signature(secret, webhook_id, webhook_timestamp, body)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not signature_matches(webhook_signature, expected):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")


def handle_event(event: dict[str, Any]) -> None:
    # Etsy payloads are thin: fetch event["resource_url"] with your OAuth token for full data
    event_type = event.get("event_type")
    if event_type == "order.paid":
        print("Order paid:", event.get("shop_id"), event.get("resource_url"))
    elif event_type == "order.canceled":
        print("Order canceled:", event.get("shop_id"), event.get("resource_url"))
    elif event_type == "order.shipped":
        print("Order shipped:", event.get("shop_id"), event.get("resource_url"))
    elif event_type == "order.delivered":
        print("Order delivered:", event.get("shop_id"), event.get("resource_url"))
    elif event_type in ("listing.created", "listing.updated", "listing.deleted"):
        print(f"{event_type}:", event.get("listing_id"))
    elif event_type in ("inventory.created", "inventory.updated", "inventory.deleted"):
        print(f"{event_type}:", event.get("listing_id"), event.get("product_id"))
    elif event_type == "inventory.out_of_stock":
        print("Product out of stock:", event.get("listing_id"), event.get("product_id"))
    else:
        print("Unhandled event type:", event_type)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/etsy")
async def etsy_webhook(
    event: dict[str, Any] = Depends(verified_etsy_event),
    webhook_id: str = Header(..., alias="webhook-id"),
):
    # webhook-id is stable across retries: use it as your idempotency key
    print(f"Received Etsy webhook {webhook_id}: {event.get('event_type')}")
    handle_event(event)
    return {"received": True, "event_type": event.get("event_type")}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
