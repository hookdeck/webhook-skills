# Generated with: attentive-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

attentive_secret = os.environ.get("ATTENTIVE_WEBHOOK_SECRET")


def verify_attentive_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify an Attentive webhook signature.

    Attentive signs the raw request body with HMAC-SHA256 keyed on your
    per-webhook signing key and sends the hex-encoded digest in the
    `x-attentive-hmac-sha256` header. There is no timestamp in the signature.
    """
    if not signature_header:
        return False

    # Compute the expected signature over the raw body, hex-encoded
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected_signature, signature_header)


@app.post("/webhooks/attentive")
async def attentive_webhook(request: Request):
    # Get the raw body for signature verification (do NOT parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("x-attentive-hmac-sha256")

    # Verify webhook signature before trusting the payload
    if not verify_attentive_webhook(raw_body, signature_header, attentive_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event_type = payload.get("type")
    timestamp = payload.get("timestamp")
    subscriber = payload.get("subscriber", {})

    when = (
        datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat()
        if timestamp
        else "unknown time"
    )
    print(f"Received {event_type} event at {when}")

    # Handle the event based on its type
    if event_type == "sms.subscribed":
        print(f"SMS opt-in: {subscriber.get('phone')}")
        # Your code: Sync opt-in state, trigger welcome flow, etc.

    elif event_type == "sms.unsubscribed":
        print(f"SMS opt-out: {subscriber.get('phone')}")
        # Your code: Suppress sends, update CRM consent, etc.

    elif event_type == "sms.sent":
        print(f"SMS sent to: {subscriber.get('phone')}")
        # Your code: Delivery logging, analytics, etc.

    elif event_type == "sms.inbound_message":
        print(f"Inbound SMS from: {subscriber.get('phone')}")
        # Your code: Support routing, keyword automations, etc.

    elif event_type == "sms.message_link_click":
        print(f"SMS link click: {subscriber.get('phone')}")
        # Your code: Attribution, engagement scoring, etc.

    elif event_type == "email.subscribed":
        print(f"Email opt-in: {subscriber.get('email')}")
        # Your code: Sync opt-in state, etc.

    elif event_type == "email.unsubscribed":
        print(f"Email opt-out: {subscriber.get('email')}")
        # Your code: Suppress sends, update consent, etc.

    elif event_type == "email.sent":
        print(f"Email sent to: {subscriber.get('email')}")
        # Your code: Delivery logging, etc.

    elif event_type == "email.opened":
        print(f"Email opened by: {subscriber.get('email')}")
        # Your code: Engagement scoring, re-targeting, etc.

    elif event_type == "email.message_link_click":
        print(f"Email link click: {subscriber.get('email')}")
        # Your code: Attribution, engagement scoring, etc.

    elif event_type == "custom_attribute.set":
        print(f"Custom attribute set for: {subscriber.get('phone') or subscriber.get('email')}")
        # Your code: Sync enriched data to your systems, etc.

    else:
        print(f"Unhandled event: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
