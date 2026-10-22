# Generated with: kustomer-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

# Naive in-memory dedupe on the event id; use a shared store in production.
seen_events: set[str] = set()


def verify_kustomer_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Kustomer signs the raw body: hex HMAC-SHA256 keyed with the webhook token."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/kustomer")
async def kustomer_webhook(
    request: Request,
    x_kustomer_webhook_signature: str | None = Header(default=None),
):
    # Read the raw bytes: parsing JSON first would change the signed content.
    raw_body = await request.body()

    if not x_kustomer_webhook_signature:
        raise HTTPException(status_code=400, detail="Missing X-Kustomer-Webhook-Signature header")

    if not verify_kustomer_signature(
        raw_body, x_kustomer_webhook_signature, os.getenv("KUSTOMER_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_id = event.get("id")
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}
    if event_id:
        seen_events.add(event_id)

    # The event type is the "name" field in the body.
    name = event.get("name")
    object_id = (event.get("data") or {}).get("id")
    if name == "kustomer.conversation.create":
        print(f"Conversation created: {object_id}")
    elif name == "kustomer.conversation.update":
        print(f"Conversation updated: {object_id}")
    elif name == "kustomer.customer.create":
        print(f"Customer created: {object_id}")
    elif name == "kustomer.customer.update":
        print(f"Customer updated: {object_id}")
    elif name == "kustomer.message.create":
        print(f"Message created: {object_id}")
    elif name == "kustomer.message.update":
        print(f"Message updated: {object_id}")
    else:
        print(f"Unhandled event: {name}")

    # Respond 2xx quickly: Kustomer disables the webhook after 10 consecutive failures.
    return {"received": True}
