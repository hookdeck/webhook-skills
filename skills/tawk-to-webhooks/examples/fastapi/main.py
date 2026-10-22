# Generated with: tawk-to-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_tawk_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """tawk.to: lowercase hex HMAC-SHA1 of the raw body, keyed with the webhook secret."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())


@app.post("/webhooks/tawk-to")
async def tawk_webhook(request: Request):
    # Raw bytes: do not parse JSON before verifying
    raw_body = await request.body()
    signature = request.headers.get("x-tawk-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Tawk-Signature header")
    if not verify_tawk_signature(raw_body, signature, os.getenv("TAWK_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # X-Hook-Event-Id is stable across retries: use it for idempotency
    event_id = request.headers.get("x-hook-event-id")
    event = payload.get("event")
    print(f"Received {event} (event id: {event_id})")

    if event == "chat:start":
        print("Chat started:", payload.get("chatId"))
    elif event == "chat:end":
        print("Chat ended:", payload.get("chatId"))
    elif event == "chat:transcript_created":
        print("Transcript created:", (payload.get("chat") or {}).get("id"))
    elif event == "ticket:create":
        print("Ticket created:", (payload.get("ticket") or {}).get("id"))
    else:
        print("Unhandled event:", event)

    return {"received": True}
