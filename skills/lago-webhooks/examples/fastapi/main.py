# Generated with: lago-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_lago_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Lago webhook signature (HMAC mode).

    X-Lago-Signature is the base64 HMAC-SHA256 of the raw request body, keyed
    with the organization HMAC Signature Token.
    """
    if not signature_header or not secret:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature_header.encode("utf-8"), expected.encode("ascii"))


@app.post("/webhooks/lago")
async def lago_webhook(request: Request):
    # Raw bytes for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-lago-signature")
    algorithm = request.headers.get("x-lago-signature-algorithm")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Lago-Signature header")

    # Lago defaults to jwt; this handler only supports hmac
    if algorithm and algorithm != "hmac":
        raise HTTPException(
            status_code=400,
            detail="Unsupported signature algorithm: create the Lago endpoint with hmac",
        )

    if not verify_lago_signature(raw_body, signature, os.getenv("LAGO_HMAC_KEY")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # X-Lago-Unique-Key is the idempotency key: skip keys you have already processed
    unique_key = request.headers.get("x-lago-unique-key")
    event_type = event.get("webhook_type")
    obj = event.get(event.get("object_type") or "") or {}

    if event_type == "invoice.created":
        print("Invoice created:", obj.get("lago_id"), unique_key)
        # TODO: Record receivable, send invoice
    elif event_type == "invoice.payment_status_updated":
        print("Invoice payment status:", obj.get("lago_id"), obj.get("payment_status"))
        # TODO: Mark invoice paid/failed internally
    elif event_type == "subscription.started":
        print("Subscription started:", obj.get("external_id") or obj.get("lago_id"))
        # TODO: Provision access
    elif event_type == "subscription.terminated":
        print("Subscription terminated:", obj.get("external_id") or obj.get("lago_id"))
        # TODO: Revoke access
    elif event_type == "customer.created":
        print("Customer created:", obj.get("external_id") or obj.get("lago_id"))
        # TODO: Sync customer to CRM
    elif event_type == "wallet.depleted_ongoing_balance":
        print("Wallet depleted:", obj.get("lago_id"))
        # TODO: Prompt a top-up
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
