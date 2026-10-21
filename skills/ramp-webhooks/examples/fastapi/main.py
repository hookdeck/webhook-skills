import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_ramp_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Ramp webhook signature.

    Ramp sends X-Ramp-Signature = hex(HMAC-SHA256(secret, rawBody)), where the
    secret is the raw string returned when the subscription was created.
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Timing-safe comparison
    return hmac.compare_digest(signature.strip().lower(), expected)


def handle_ramp_event(event: dict) -> None:
    """Dispatch a verified Ramp event on its `type`.

    Payloads carry only IDs; fetch the resource from the Ramp API for details.
    """
    event_type = event.get("type")
    object_id = (event.get("object") or {}).get("id")

    if event_type == "webhooks.verification":
        # Sent once when the subscription is created. Returning 2xx is step one;
        # you must also POST the challenge to /developer/v1/webhooks/{id}/verify.
        print(f"Verification challenge received: {event.get('challenge')}")
    elif event_type == "transactions.authorized":
        print(f"Transaction authorized: {object_id}")
        # TODO: Record the pending card authorization
    elif event_type == "transactions.cleared":
        print(f"Transaction cleared: {object_id}")
        # TODO: Fetch the transaction; entity_amount.value is negative for refunds
    elif event_type == "transactions.declined":
        print(f"Transaction declined: {object_id}")
        # TODO: Alert the cardholder or finance team
    elif event_type == "reimbursements.ready_for_review":
        print(f"Reimbursement ready for review: {object_id}")
        # TODO: Route to an approver
    elif event_type == "bills.created":
        print(f"Bill created: {object_id}")
        # TODO: Sync the bill to your accounting system
    elif event_type == "bills.approved":
        print(f"Bill approved: {object_id}")
        # TODO: Schedule payment
    elif event_type == "bills.paid":
        print(f"Bill paid: {object_id}")
        # TODO: Mark the bill as paid
    elif event_type == "tests.test_event":
        print("Received Ramp test event")
    else:
        print(f"Unhandled Ramp event type: {event_type}")


@app.post("/webhooks/ramp")
async def ramp_webhook(request: Request):
    secret = os.environ.get("RAMP_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-ramp-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Ramp-Signature header")

    # Use the raw body for verification (not request.json())
    raw_body = await request.body()
    if not verify_ramp_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Business events repeat the same event id on every retry (also sent as
    # X-Ramp-Webhook-ID); use it to de-duplicate.
    handle_ramp_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
