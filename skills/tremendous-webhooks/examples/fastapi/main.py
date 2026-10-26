# Generated with: tremendous-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_tremendous_webhook(raw_body: bytes, signature_header: str | None, private_key: str | None) -> bool:
    """Verify Tremendous-Webhook-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body."""
    if not signature_header or not private_key or not signature_header.startswith("sha256="):
        return False

    sig = signature_header[len("sha256="):].lower()
    expected = hmac.new(private_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header yields False (401/400), not a TypeError (500)
    return hmac.compare_digest(sig.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/tremendous")
async def tremendous_webhook(request: Request):
    # Raw bytes: the signature covers the exact body sent
    raw_body = await request.body()
    signature = request.headers.get("tremendous-webhook-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing Tremendous-Webhook-Signature header")

    if not verify_tremendous_webhook(raw_body, signature, os.getenv("TREMENDOUS_WEBHOOK_PRIVATE_KEY")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Tremendous retries up to 17 times unless it gets a 200: dedupe on event["uuid"]
    event_type = event.get("event")
    payload = event.get("payload") or {}
    resource_id = (payload.get("resource") or {}).get("id")

    if event_type == "REWARDS.DELIVERY.SUCCEEDED":
        print(f"Reward {resource_id} delivered")
    elif event_type == "REWARDS.DELIVERY.FAILED":
        print(f"Reward {resource_id} delivery failed: {payload.get('meta')}")
    elif event_type == "REWARDS.CANCELED":
        print(f"Reward {resource_id} canceled")
    elif event_type == "REWARDS.FLAGGED":
        print(f"Reward {resource_id} flagged for fraud review")
    elif event_type == "ORDERS.CREATED":
        print(f"Order {resource_id} created")
    elif event_type == "ORDERS.APPROVED":
        print(f"Order {resource_id} approved")
    elif event_type == "ORDERS.CANCELED":
        print(f"Order {resource_id} canceled")
    elif event_type == "ORDERS.FAILED":
        print(f"Order {resource_id} failed")
    elif event_type == "CAMPAIGNS.CREATED":
        print(f"Campaign {resource_id} created")
    elif event_type == "FUNDING_SOURCES.FUNDED":
        print(f"Funding source {resource_id} funded")
    elif event_type == "INVOICES.PAID":
        print(f"Invoice {resource_id} paid")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}
