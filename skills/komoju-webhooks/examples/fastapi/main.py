# Generated with: komoju-webhooks skill
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
seen_event_ids: set[str] = set()


def verify_komoju_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a KOMOJU webhook signature.

    KOMOJU sends ``X-Komoju-Signature: <hex>`` (no prefix) when the webhook has a secret token: the
    lowercase hex HMAC-SHA256 of the raw request body, keyed with that secret token. Nothing else
    is signed. Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header, re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)


@app.post("/webhooks/komoju")
async def komoju_webhook(request: Request):
    secret = os.environ.get("KOMOJU_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body
    raw_body = await request.body()
    signature = request.headers.get("x-komoju-signature")

    if not verify_komoju_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid body")

    # KOMOJU retries non-2xx responses: dedupe on the event id
    event_id = event.get("id")
    if isinstance(event_id, str) and event_id:
        if event_id in seen_event_ids:
            return {"received": True, "duplicate": True}
        seen_event_ids.add(event_id)

    # The body's `type` is also sent in the X-Komoju-Event header; `data` is the resource
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}

    event_type = event.get("type")
    if event_type == "ping":
        print(f"Ping from webhook {data.get('id')}")
    elif event_type in ("payment.authorized", "payment.captured", "payment.refunded", "payment.failed"):
        print(f"{event_type}: payment {data.get('id')} ({data.get('status')}) {data.get('total')} {data.get('currency')}")
    elif event_type == "customer.created":
        print(f"Customer created: {data.get('id')}")
    elif event_type in ("subscription.created", "subscription.captured"):
        print(f"{event_type}: subscription {data.get('id')}")
    else:
        print(f"Unhandled KOMOJU event: {event_type}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
