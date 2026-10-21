# Generated with: lemon-squeezy-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """X-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature_header.encode("utf-8"))


@app.post("/webhooks/lemon-squeezy")
async def lemon_squeezy_webhook(
    request: Request,
    x_signature: str | None = Header(default=None),
    x_event_name: str | None = Header(default=None),
):
    if not x_signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    # Use the raw bytes - re-serialising parsed JSON would change what was signed
    raw_body = await request.body()

    secret = os.getenv("LEMON_SQUEEZY_SIGNING_SECRET", "")
    if not verify_signature(raw_body, x_signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # X-Event-Name carries the event; meta.event_name has the same value
    meta = payload.get("meta", {})
    event_name = x_event_name or meta.get("event_name")
    resource = payload.get("data", {})
    attributes = resource.get("attributes", {})
    # custom_data is whatever you passed to checkout (e.g. your user id)
    custom_data = meta.get("custom_data")

    if event_name == "order_created":
        print(f"Order created: {resource.get('id')} ({attributes.get('total_formatted')})", custom_data)
    elif event_name == "order_refunded":
        print(f"Order refunded: {resource.get('id')}")
    elif event_name == "subscription_created":
        print(f"Subscription created: {resource.get('id')} ({attributes.get('status')})", custom_data)
    elif event_name == "subscription_updated":
        print(f"Subscription updated: {resource.get('id')} ({attributes.get('status')})")
    elif event_name == "subscription_cancelled":
        print(f"Subscription cancelled: {resource.get('id')}, ends at {attributes.get('ends_at')}")
    elif event_name == "subscription_payment_success":
        print(f"Subscription payment succeeded: invoice {resource.get('id')}")
    elif event_name == "license_key_created":
        print(f"License key created: {resource.get('id')}")
    else:
        print(f"Unhandled event: {event_name}")

    # Lemon Squeezy retries up to 3 more times on any non-200 response
    return {"received": True}
