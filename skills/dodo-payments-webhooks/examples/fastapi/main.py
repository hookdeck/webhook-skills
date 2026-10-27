# Generated with: dodo-payments-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Dodo Payments Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Dodo Payments sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/dodo-payments")
async def dodo_payments_webhook(request: Request):
    secret = os.environ.get("DODO_PAYMENTS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("DODO_PAYMENTS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Dodo Payments signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Dodo Payments webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The envelope is { business_id, type, timestamp, data }; data.payload_type names the resource kind
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Dodo Payments webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "payment.succeeded":
        print(f"Payment succeeded: {data.get('payment_id')}")
    elif event_type == "payment.failed":
        print(f"Payment failed: {data.get('payment_id')}")
    elif event_type == "payment.processing":
        print(f"Payment processing: {data.get('payment_id')}")
    elif event_type == "payment.cancelled":
        print(f"Payment cancelled: {data.get('payment_id')}")
    elif event_type == "refund.succeeded":
        print(f"Refund succeeded: {data.get('refund_id')}")
    elif event_type == "refund.failed":
        print(f"Refund failed: {data.get('refund_id')}")
    elif event_type == "dispute.opened":
        print(f"Dispute opened: {data.get('dispute_id')}")
    elif event_type == "dispute.won":
        print(f"Dispute won: {data.get('dispute_id')}")
    elif event_type == "dispute.lost":
        print(f"Dispute lost: {data.get('dispute_id')}")
    elif event_type == "subscription.active":
        print(f"Subscription active: {data.get('subscription_id')}")
    elif event_type == "subscription.renewed":
        print(f"Subscription renewed: {data.get('subscription_id')}")
    elif event_type == "subscription.on_hold":
        print(f"Subscription on hold: {data.get('subscription_id')}")
    elif event_type == "subscription.cancelled":
        print(f"Subscription cancelled: {data.get('subscription_id')}")
    elif event_type == "license_key.created":
        print(f"License key created: {data.get('payload_type')}")
    else:
        # Events can arrive out of order and the documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
