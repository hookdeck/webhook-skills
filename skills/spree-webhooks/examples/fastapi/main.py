# Generated with: spree-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_spree_signature(
    raw_body: bytes,
    signature: str | None,
    timestamp: str | None,
    secret: str,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Spree delivery.

    X-Spree-Webhook-Signature is the bare hex HMAC-SHA256 of the bytes
    "<X-Spree-Webhook-Timestamp>." + raw body, keyed with the endpoint's
    secret_key (UTF-8, used as-is, not hex-decoded). Spree has no Python
    verification helper, so verify manually.

    Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
    original timestamp, so a window is off unless tolerance_seconds > 0.
    """
    if not signature or not timestamp or not secret:
        return False

    # Validate format first (exact length and alphabet)
    if not HEX_64.fullmatch(signature):
        return False

    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    # Build the signed message as bytes: "<timestamp>." + raw body (never a re-encoded string)
    try:
        signed_payload = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest().encode()

    # Hex is case-insensitive: lowercase, then compare bytes in constant time
    return hmac.compare_digest(expected, signature.lower().encode())


@app.post("/webhooks/spree")
async def spree_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()
    tolerance = int(os.environ.get("SPREE_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not verify_spree_signature(
        payload,
        request.headers.get("x-spree-webhook-signature"),
        request.headers.get("x-spree-webhook-timestamp"),
        os.environ.get("SPREE_WEBHOOK_SECRET", ""),
        tolerance,
    ):
        print("Spree webhook verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Deduplicate on event["id"]: a re-sent delivery carries the same id
    event = event if isinstance(event, dict) else {}
    name = event.get("name")
    event_id = event.get("id")
    data = _as_dict(event.get("data"))

    # Dispatch on the body's name (also sent as X-Spree-Webhook-Event)
    if name == "order.placed":
        print(f"Order placed: event={event_id} order={data.get('id')}")
        # TODO: Send the order to your fulfilment or CRM system

    elif name == "order.paid":
        print(f"Order paid: event={event_id} order={data.get('id')}")
        # TODO: Release the order for fulfilment

    elif name == "order.canceled":
        print(f"Order canceled: event={event_id} order={data.get('id')}")
        # TODO: Cancel downstream work

    elif name == "payment.completed":
        print(f"Payment completed: event={event_id} payment={data.get('id')}")
        # TODO: Record the payment

    elif name == "fulfillment.fulfilled":
        print(f"Parcel shipped: event={event_id} fulfillment={data.get('id')}")
        # TODO: Notify the customer with tracking details

    elif name == "user.created":
        print(f"Customer registered: event={event_id} user={data.get('id')}")
        # TODO: Sync the customer to your CRM

    elif name == "product.updated":
        print(f"Product updated: event={event_id} product={data.get('id')}")
        # TODO: Refresh your search index or cache

    elif name == "webhook.test":
        print(f"Test delivery received: event={event_id}")

    else:
        print(f"Unhandled event: {name}")

    # Any 2xx acknowledges the delivery
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
