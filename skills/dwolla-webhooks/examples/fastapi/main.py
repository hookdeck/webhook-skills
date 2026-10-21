# Generated with: dwolla-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# In-memory dedupe by event ID; use a database or Redis in production.
processed_events: set[str] = set()


def verify_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Dwolla signs the raw body: HMAC-SHA256, hex, keyed with the subscription secret."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/dwolla")
async def dwolla_webhook(request: Request):
    # Raw body, never re-encoded JSON
    raw_body = await request.body()
    signature = request.headers.get("x-request-signature-sha-256")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Request-Signature-SHA-256 header")

    if not verify_signature(raw_body, signature, os.getenv("DWOLLA_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Duplicates must still return 2xx or Dwolla may pause the subscription.
    if event.get("id") in processed_events:
        return {"received": True, "duplicate": True}
    processed_events.add(event.get("id"))

    topic = event.get("topic")
    resource_id = event.get("resourceId")

    if topic == "customer_created":
        print(f"Customer created: {resource_id}")
    elif topic == "customer_verified":
        print(f"Customer verified: {resource_id}")
    elif topic == "customer_funding_source_added":
        print(f"Funding source added: {resource_id}")
    elif topic == "customer_funding_source_verified":
        print(f"Funding source verified: {resource_id}")
    elif topic == "customer_transfer_created":
        print(f"Transfer created: {resource_id}")
    elif topic == "customer_transfer_completed":
        print(f"Transfer completed: {resource_id}")
    elif topic == "customer_transfer_failed":
        print(f"Transfer failed: {resource_id}")
    elif topic == "customer_bank_transfer_completed":
        print(f"Bank transfer completed: {resource_id}")
    else:
        print(f"Unhandled topic: {topic}")

    return {"received": True}
