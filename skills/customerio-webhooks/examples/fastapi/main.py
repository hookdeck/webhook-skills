# Generated with: customerio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

signing_key = os.environ.get("CUSTOMERIO_WEBHOOK_SIGNING_KEY")


def verify_customerio_webhook(raw_body: bytes, timestamp: str, signature: str, key: str) -> bool:
    """Verify a Customer.io Reporting Webhook signature.

    Signed string is "v0:<X-CIO-Timestamp>:<raw body>", HMAC-SHA256, hex digest,
    compared against the X-CIO-Signature header.
    """
    if not timestamp or not signature:
        return False

    # Build "v0:<timestamp>:<raw body>" as bytes so the raw body is never re-encoded.
    signed_content = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    expected_signature = hmac.new(
        key.encode("utf-8"),
        signed_content,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)


@app.post("/webhooks/customerio")
async def customerio_webhook(request: Request):
    # Get the RAW body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("x-cio-signature")
    timestamp = request.headers.get("x-cio-timestamp")

    # Verify webhook signature over the raw body
    if not verify_customerio_webhook(raw_body, timestamp, signature, signing_key):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event_id = payload.get("event_id")
    # Customer.io's docs spell the in-app object type both `in_app` and `in-app`: accept both.
    object_type = payload.get("object_type")
    if object_type == "in-app":
        object_type = "in_app"
    metric = payload.get("metric")
    data = payload.get("data", {})

    # Customer.io has no dotted event name: identify events by object_type + metric.
    print(f"Received {object_type}.{metric} event (event_id: {event_id})")

    # Your code: de-dupe on event_id before processing (Customer.io retries for 7 days)

    if metric == "cio_subscription_preferences_changed":
        # Carries the triggering channel in object_type, so route it on metric alone.
        print(f"Subscription preferences changed for customer {data.get('customer_id')}")
        # Your code: sync topic preferences (data["content"], when Body content is on)

    elif object_type == "email":
        handle_email_metric(metric, data)

    elif object_type == "sms":
        print(f"SMS {metric} to {data.get('recipient')}")
        # Your code: SMS analytics, two-way messaging, etc.

    elif object_type == "push":
        print(f"Push {metric} for customer {data.get('customer_id')}")
        # Your code: push engagement tracking, etc.

    elif object_type == "in_app":
        print(f"In-app {metric} for customer {data.get('customer_id')}")
        # Your code: in-app message engagement, etc.

    elif object_type == "customer":
        print(f"Customer {data.get('customer_id')} {metric}")
        # Your code: sync subscription state to your database, etc.

    elif object_type in ("slack", "webhook", "whatsapp"):
        print(f"{object_type} {metric}")
        # Your code: channel-specific handling

    else:
        print(f"Unhandled object_type: {object_type} ({metric})")

    # Return 2xx within 4 seconds to acknowledge receipt
    return {"received": True}


def handle_email_metric(metric: str, data: dict):
    """Handle the metric for an email event (object_type == 'email')."""
    recipient = data.get("recipient")
    if metric == "delivered":
        print(f"Email delivered to {recipient}")
    elif metric == "opened":
        print(f"Email opened by {recipient}")
    elif metric == "clicked":
        print(f"Email link clicked: {data.get('href')} (link_id: {data.get('link_id')})")
    elif metric == "bounced":
        print(f"Email bounced for {recipient}: {data.get('failure_message')}")
        # Your code: suppress the address, alert, etc.
    elif metric == "spammed":
        print(f"Email marked as spam by {recipient}")
    elif metric == "converted":
        print(f"Email conversion for customer {data.get('customer_id')}")
    else:
        print(f"Email {metric} for {recipient}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
