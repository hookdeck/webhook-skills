# Generated with: justt-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Justt Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Justt sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/justt")
async def justt_webhook(request: Request):
    secret = os.environ.get("JUSTT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("JUSTT_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Justt signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Justt webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The envelope is { type, timestamp, data }; the event name is the top-level type
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Justt webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "chargeback.created":
        print(f"Chargeback created: {data.get('chargebackId')}")
    elif event_type == "chargeback.updated":
        print(f"Chargeback updated: {data.get('chargebackId')}")
    elif event_type == "chargeback.status.updated":
        print(f"Chargeback status updated: {data.get('chargebackId')} {data.get('status')}")
    elif event_type == "chargeback.evidence.submitted":
        # data.status is succeeded | failed
        print(f"Chargeback evidence submitted: {data.get('chargebackId')} {data.get('status')}")
    elif event_type == "chargeback.accepted":
        # data.status is succeeded | failed
        print(f"Chargeback accepted: {data.get('chargebackId')} {data.get('status')}")
    elif event_type == "pre_chargeback_alert.received":
        print(f"Pre-chargeback alert received: {data.get('internalAlertId')}")
    elif event_type == "pre_chargeback_alert.refund.succeeded":
        print(f"Alert refund succeeded: {data.get('internalAlertId')}")
    elif event_type == "pre_chargeback_alert.refund.failed":
        print(f"Alert refund failed: {data.get('internalAlertId')}")
    elif event_type == "pre_chargeback_alert.transaction_matched":
        # Opt-in: only sent when Justt enables additional event types for your account
        print(f"Alert transaction matched: {data.get('internalAlertId')}")
    elif event_type == "subscription.cancel_immediately.success":
        print(f"Subscription cancelled: {data.get('subscriptionId')}")
    elif event_type == "subscription.cancel_immediately.failed":
        print(f"Subscription cancel failed: {data.get('subscriptionId')} {data.get('failureCode')}")
    else:
        # The documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
