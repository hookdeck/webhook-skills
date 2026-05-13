# Generated with: orb-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

TOLERANCE_SECONDS = 300  # 5-minute replay window


def verify_orb_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp: str | None,
    secret: str,
) -> bool:
    """Verify an Orb webhook signature.

    Orb signs `v1:{X-Orb-Timestamp}:{raw_body}` with HMAC-SHA256 using your
    per-endpoint signing secret. The hex digest arrives in `X-Orb-Signature`
    prefixed with `v1=`.
    """
    if not signature_header or not timestamp or not secret:
        return False

    provided = signature_header[3:] if signature_header.startswith("v1=") else signature_header

    signed_content = f"v1:{timestamp}:".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()

    return hmac.compare_digest(provided, expected)


def is_timestamp_fresh(timestamp: str | None, tolerance_seconds: int = TOLERANCE_SECONDS) -> bool:
    if not timestamp:
        return False
    try:
        # Python's fromisoformat supports trailing Z from 3.11+; normalize for older versions.
        normalized = timestamp.replace("Z", "+00:00")
        delivered_at = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    if delivered_at.tzinfo is None:
        delivered_at = delivered_at.replace(tzinfo=timezone.utc)
    skew = abs((datetime.now(timezone.utc) - delivered_at).total_seconds())
    return skew <= tolerance_seconds


@app.post("/webhooks/orb")
async def orb_webhook(request: Request):
    raw_body = await request.body()
    signature_header = request.headers.get("x-orb-signature")
    timestamp = request.headers.get("x-orb-timestamp")
    secret = os.environ.get("ORB_WEBHOOK_SECRET", "")

    if not signature_header or not timestamp:
        raise HTTPException(status_code=400, detail="Missing Orb signature headers")

    if not is_timestamp_fresh(timestamp):
        raise HTTPException(status_code=400, detail="Timestamp outside tolerance")

    if not verify_orb_signature(raw_body, signature_header, timestamp, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    props = event.get("properties") or {}

    if event_type == "customer.created":
        print(f"Customer created: {props.get('customer_id', event.get('id'))}")
        # TODO: Sync customer to CRM
    elif event_type == "customer.credit_balance_dropped":
        print(f"Credit balance dropped for: {props.get('customer_id')}")
        # TODO: Trigger top-up reminder
    elif event_type == "subscription.created":
        print(f"Subscription created: {props.get('subscription_id')}")
        # TODO: Provision access
    elif event_type == "subscription.started":
        print(f"Subscription started: {props.get('subscription_id')}")
        # TODO: Activate entitlements
    elif event_type == "subscription.ended":
        print(f"Subscription ended: {props.get('subscription_id')}")
        # TODO: Revoke access
    elif event_type == "subscription.plan_changed":
        print(f"Subscription plan changed: {props.get('subscription_id')}")
        # TODO: Update entitlements
    elif event_type == "subscription.usage_exceeded":
        print(f"Usage exceeded for: {props.get('subscription_id')}")
        # TODO: Notify customer / throttle
    elif event_type == "invoice.issued":
        print(f"Invoice issued: {props.get('invoice_id')}")
        # TODO: Record receivable, email invoice
    elif event_type == "invoice.payment_succeeded":
        print(f"Invoice paid: {props.get('invoice_id')}")
        # TODO: Mark paid internally
    elif event_type == "invoice.payment_failed":
        print(f"Invoice payment failed: {props.get('invoice_id')}")
        # TODO: Start dunning
    elif event_type == "data_exports.transfer_success":
        print(f"Data export delivered: {event.get('id')}")
        # TODO: Kick off downstream ETL
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
