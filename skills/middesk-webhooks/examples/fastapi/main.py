# Generated with: middesk-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_middesk_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Middesk webhook signature.

    Middesk sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
    X-Middesk-Signature-256 header. The key is the secret you set when creating the
    webhook, used whole as a UTF-8 string (no whsec_ stripping, no base64 decoding).
    This is NOT Standard Webhooks.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison (compare as bytes so non-ASCII headers cannot raise).
    return hmac.compare_digest(
        signature_header.strip().lower().encode("utf-8"),
        expected.encode("utf-8"),
    )


@app.post("/webhooks/middesk")
async def middesk_webhook(request: Request):
    # Read the raw body for signature verification - do NOT parse it first.
    raw_body = await request.body()
    signature = request.headers.get("x-middesk-signature-256")

    # Verify the signature before trusting the payload.
    if not verify_middesk_webhook(raw_body, signature, os.environ.get("MIDDESK_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    print(f"Received Middesk event {event.get('id')}: {event_type}")

    if event_type == "business.created":
        print(f"Business {obj.get('id')} created (status: {obj.get('status')})")
        # TODO: Store the business ID against your customer record.

    elif event_type == "business.updated":
        print(f"Business {obj.get('id')} updated (status: {obj.get('status')})")
        # TODO: React to status changes such as approved, rejected or in_review.

    elif event_type == "order.created":
        print(f"Order {obj.get('id')} created")

    elif event_type == "order.updated":
        print(f"Order {obj.get('id')} updated (status: {obj.get('status')})")
        # TODO: Fetch the completed order results.

    elif event_type in ("monitor.created", "monitor.updated"):
        print(f"Monitor event {event_type} for {obj.get('id')}")

    elif event_type == "tin.retried":
        print("TIN retry completed")

    elif event_type == "lien.updated":
        print(f"Lien {obj.get('id')} updated")

    else:
        # Return 2xx for unhandled types so Middesk does not retry.
        print(f"Unhandled event type: {event_type}")

    # Any 2xx tells Middesk the delivery succeeded.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
