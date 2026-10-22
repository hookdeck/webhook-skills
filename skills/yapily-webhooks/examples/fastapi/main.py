import os
import hmac
import hashlib
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_yapily_webhook(raw_body: bytes, signatures: list, secret: Optional[str]) -> bool:
    """Verify a Yapily webhook signature.

    Yapily sends the lowercase hex HMAC-SHA256 of the raw body in `webhook-signature`,
    keyed with the webhook secret as UTF-8. While a delayed secret reset is in progress it
    also sends `webhook-rotation-signature`; either header may match.
    This is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp.
    """
    if not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return any(
        hmac.compare_digest(sig.strip().lower().encode(), expected.encode())
        for sig in signatures
        if sig
    )


@app.post("/webhooks/yapily")
async def yapily_webhook(
    request: Request,
    webhook_signature: Optional[str] = Header(default=None),
    webhook_rotation_signature: Optional[str] = Header(default=None),
):
    # Raw body for signature verification: do not parse JSON first
    raw_body = await request.body()
    signatures = [webhook_signature, webhook_rotation_signature]

    if not any(signatures):
        raise HTTPException(status_code=400, detail="Missing signature header")

    if not verify_yapily_webhook(raw_body, signatures, os.environ.get("YAPILY_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("type")
    event = payload.get("event") or {}
    tracing_id = (payload.get("metadata") or {}).get("tracingId")
    print(f"Received {event_type} (webhook: {payload.get('id')}, tracingId: {tracing_id})")

    if event_type == "single_payment.status.completed":
        print(f"Payment {event.get('id')} completed")
        # TODO: Mark the payment as settled in your system

    elif event_type == "single_payment.status.updated":
        print(f"Payment {event.get('id')} status: {event.get('status')}")
        # TODO: Handle COMPLETED or FAILED

    elif event_type == "single_payment.iso_status.updated":
        iso = (event.get("statusDetails") or {}).get("isoStatus") or {}
        print(f"Payment {event.get('id')} ISO status: {iso.get('code')}")
        # TODO: Track ISO 20022 status transitions

    elif event_type == "hosted_pis.payment_status.completed.v1":
        print(f"Hosted payment {event.get('paymentRequestId')} completed")
        # TODO: Fulfil the order

    elif event_type == "hosted_pis.payment_status.failed.v1":
        print(f"Hosted payment {event.get('paymentRequestId')} failed")
        # TODO: Notify the customer / offer retry

    else:
        # Other event categories (for example async data-access completion) land here
        print(f"Unhandled event type: {event_type}")

    # Yapily expects a 200 within 1 second
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
