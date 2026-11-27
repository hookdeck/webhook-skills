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

TOLERANCE_SECONDS = 300  # 5 minutes, the tolerance Orb's SDKs use


def verify_orb_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp: str | None,
    secret: str,
) -> bool:
    """Verify an Orb webhook signature.

    Orb signs `v1:{X-Orb-Timestamp}:{raw_body}` with HMAC-SHA256 using your
    per-endpoint signing secret. The hex digest arrives in `X-Orb-Signature`
    prefixed with `v1=`. During a secret rotation the header can carry several
    space-separated signatures; the delivery is valid if any one matches.
    """
    if not signature_header or not timestamp or not secret:
        return False

    signed_content = f"v1:{timestamp}:".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()

    for entry in signature_header.split(" "):
        provided = entry[3:] if entry.startswith("v1=") else entry
        if hmac.compare_digest(provided, expected):
            return True
    return False


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
    # `properties` holds only the extra fields specific to the event — it is an
    # empty object for many types and never carries the resource ID.
    props = event.get("properties") or {}

    # Orb serializes the resource under a key matching the `resource_name`
    # prefix of `type`, and that is where the resource ID lives.
    def resource_id(key):
        return (event.get(key) or {}).get("id")

    # "standard" or "expanded", set per endpoint. Absent on payloads created
    # before payload styles existed, which read as "expanded". Retries of older
    # events keep their original style, so a handler can see both.
    style = event.get("payload_style", "expanded")

    if event_type == "customer.created":
        print(f"Customer created: {resource_id('customer')} ({style})")
        # Your code: Sync customer to CRM
    elif event_type == "customer.credit_balance_dropped":
        print(
            f"Credit balance dropped for: {resource_id('customer')} "
            f"threshold: {props.get('balance_threshold')}"
        )
        # Your code: Trigger top-up reminder
    elif event_type == "subscription.created":
        print(f"Subscription created: {resource_id('subscription')}")
        # Your code: Provision access
    elif event_type == "subscription.started":
        print(f"Subscription started: {resource_id('subscription')}")
        # Your code: Activate entitlements
    elif event_type == "subscription.ended":
        print(f"Subscription ended: {resource_id('subscription')}")
        # Your code: Revoke access
    elif event_type == "subscription.plan_changed":
        print(
            f"Subscription plan changed: {resource_id('subscription')} "
            f"from plan: {props.get('previous_plan_id')}"
        )
        # Your code: Update entitlements
    elif event_type == "subscription.usage_exceeded":
        print(
            f"Usage exceeded for: {resource_id('subscription')} "
            f"metric: {props.get('billable_metric_id')}"
        )
        # Your code: Notify customer / throttle
    elif event_type == "invoice.issued":
        # A standard payload omits line items — fetch the invoice if you need them.
        print(f"Invoice issued: {resource_id('invoice')} ({style})")
        # Your code: Record receivable, email invoice
    elif event_type == "invoice.payment_succeeded":
        print(
            f"Invoice paid: {resource_id('invoice')} "
            f"via: {props.get('payment_provider')}"
        )
        # Your code: Mark paid internally
    elif event_type == "invoice.payment_failed":
        print(
            f"Invoice payment failed: {resource_id('invoice')} "
            f"via: {props.get('payment_provider')}"
        )
        # Your code: Start dunning
    elif event_type == "data_exports.transfer_success":
        print(f"Data export delivered: {event.get('id')}")
        # Your code: Kick off downstream ETL
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
