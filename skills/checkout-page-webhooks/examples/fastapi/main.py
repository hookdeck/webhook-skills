# Generated with: checkout-page-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

SIGNATURE_RE = re.compile(r"(?:sha256=)?([0-9a-fA-F]{64})")

# In-memory dedupe for the example; use a shared store (Redis, DB) in production
seen_event_ids: set = set()


def verify_checkout_page_webhook(
    raw_body: bytes, signature_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify `x-webhook-signature: sha256=<64 hex>`.

    The signature is the hex HMAC-SHA256 of the raw body keyed with the signing
    secret (UTF-8 bytes). Nothing else, including x-webhook-timestamp, is signed.
    """
    if not signature_header or not secret:
        return False
    # Accept "sha256=<hex>" or the bare digest; validate length + alphabet before decoding
    match = SIGNATURE_RE.fullmatch(signature_header.strip())
    if not match:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


@app.post("/webhooks/checkout-page")
async def checkout_page_webhook(request: Request):
    secret = os.getenv("CHECKOUT_PAGE_WEBHOOK_SECRET")
    if not secret:
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes BEFORE parsing; the signature is over the exact body
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature")

    if not signature:
        return JSONResponse({"error": "Missing signature header"}, status_code=401)
    if not verify_checkout_page_webhook(raw_body, signature, secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Retries re-send the same eventId
    event_id = payload.get("eventId")
    if event_id and event_id in seen_event_ids:
        return {"received": True, "duplicate": True}
    if event_id:
        seen_event_ids.add(event_id)

    event = payload.get("event")
    attempt = request.headers.get("x-webhook-delivery-attempt")
    print(f"Received {event} (eventId {event_id}, attempt {attempt})")
    data = _as_dict(payload.get("data"))

    if event == "payment.paid":
        print("Payment paid:", json.dumps(data.get("payment", data)))
        # TODO: Fulfil the order, grant access
    elif event == "payment.created":
        print("Payment created")
    elif event == "payment.abandoned":
        print("Payment abandoned")
    elif event == "booking.created":
        print("Booking created:", json.dumps(data.get("booking", data)))
        # TODO: Sync to calendar / CRM
    elif event == "booking.paid":
        print("Booking paid")
    elif event in ("subscription.created", "subscription.active"):
        print(f"Subscription started ({event})")
        # TODO: Provision features
    elif event in ("subscription.canceled", "subscription.expired"):
        print(f"Subscription ended ({event})")
        # TODO: Revoke access
    elif event in ("customer.created", "customer.updated"):
        print(f"Customer event: {event}")
    elif event == "submission.created":
        print("Form submission created")
    else:
        print(f"Unhandled event: {event}")

    # Acknowledge quickly; do slow work asynchronously
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
