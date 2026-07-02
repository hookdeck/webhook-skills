# Generated with: klaviyo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

klaviyo_secret = os.environ.get("KLAVIYO_WEBHOOK_SECRET", "")


def verify_klaviyo_webhook(
    raw_body: bytes, timestamp: str, signature: str, secret: str
) -> bool:
    """Verify a Klaviyo system webhook signature.

    Klaviyo signs the raw request body with the Klaviyo-Timestamp header value
    appended: HMAC-SHA256(secret, raw_body + timestamp), hex-encoded. The result
    is sent in the Klaviyo-Signature header.
    """
    mac = hmac.new(secret.encode(), raw_body, hashlib.sha256)
    mac.update(timestamp.encode())  # append Klaviyo-Timestamp
    return hmac.compare_digest(mac.hexdigest(), signature)


def handle_event(event: dict) -> None:
    """Dispatch a single Klaviyo event based on its topic."""
    topic = event.get("topic")
    external_id = event.get("external_id")

    if topic == "event:klaviyo.opened_email":
        print(f"Email opened: {external_id}")
    elif topic == "event:klaviyo.clicked_email":
        print(f"Email clicked: {external_id}")
    elif topic == "event:klaviyo.bounced_email":
        print(f"Email bounced: {external_id}")
    elif topic == "event:klaviyo.marked_email_as_spam":
        print(f"Email marked as spam: {external_id}")
    elif topic == "event:klaviyo.unsubscribed_from_email_marketing":
        print(f"Unsubscribed from email marketing: {external_id}")
    elif topic == "event:klaviyo.sent_sms":
        print(f"SMS sent: {external_id}")
    elif topic == "event:klaviyo.received_sms":
        print(f"Inbound SMS received: {external_id}")
    elif topic == "event:klaviyo.submitted_review":
        print(f"Review submitted: {external_id}")
    else:
        print(f"Unhandled topic: {topic}")


@app.post("/webhooks/klaviyo")
async def klaviyo_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("klaviyo-signature")
    timestamp = request.headers.get("klaviyo-timestamp")

    if not signature or not timestamp:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    if not verify_klaviyo_webhook(raw_body, timestamp, signature, klaviyo_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Safe to parse now that the signature is verified
    body = json.loads(raw_body)

    for event in body.get("data", []):
        handle_event(event)

    # Acknowledge quickly with a 2xx
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
