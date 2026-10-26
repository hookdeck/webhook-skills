# Generated with: belco-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Demo only: use a durable store (database, Redis) in production
seen_request_ids: set[str] = set()


def verify_belco_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Belco webhook signature.

    Belco sends ``x-hook-signature: <hex>`` (no prefix): the lowercase hex HMAC-SHA256 of the
    raw request body, keyed with the webhook's secret. Nothing else is signed.
    Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header, re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)


@app.post("/webhooks/belco")
async def belco_webhook(request: Request):
    secret = os.environ.get("BELCO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body
    raw_body = await request.body()
    signature = request.headers.get("x-hook-signature")

    if not verify_belco_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid body")

    # Belco retries non-2xx responses: dedupe on requestId
    request_id = event.get("requestId")
    if isinstance(request_id, str) and request_id:
        if request_id in seen_request_ids:
            return {"received": True, "duplicate": True}
        seen_request_ids.add(request_id)

    payload = event.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    conversation = payload.get("conversation") or {}
    call = payload.get("call") or {}

    event_name = event.get("eventName")
    if event_name == "conversation.created":
        print(f"Conversation created: {conversation.get('_id')} on shop {payload.get('shopId')}")
    elif event_name == "conversation.replied":
        print(f"Conversation replied: {conversation.get('_id')}")
    elif event_name == "conversation.assigned":
        print(f"Conversation assigned: {conversation.get('_id')} to {conversation.get('assignedTo')}")
    elif event_name == "conversation.closed":
        print(f"Conversation closed: {conversation.get('_id')}")
    elif event_name in ("call.created", "call.queued", "call.answered", "call.closed"):
        print(f"{event_name}: {call.get('direction')} call, status {call.get('status')}")
    else:
        print(f"Unhandled Belco event: {event_name}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
