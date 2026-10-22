# Generated with: bird-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Bird webhook receiver for FastAPI.

Bird (bird.com, formerly MessageBird) follows the Standard Webhooks spec:
  webhook-id         identifies the delivery (stable across retries/replays)
  webhook-timestamp  Unix seconds of this delivery attempt
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list during
                     the 24h secret-rotation overlap)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Not covered: the legacy MessageBird API (MessageBird-Signature /
MessageBird-Signature-JWT headers) uses a different scheme.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("bird-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bird Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Bird delivers at-least-once; every retry and replay reuses the webhook-id.
processed_delivery_ids: set = set()


def verify_bird_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Bird delivery with the Standard Webhooks library.

    It rejects timestamps more than 5 minutes off, recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_bird_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Bird event or raises."""
    secret = os.environ.get("BIRD_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BIRD_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    # body() reads the bytes whatever the Content-Type is.
    raw_body = await request.body()

    try:
        event = verify_bird_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        # 400 is deliberate: Bird retries, so a missing/rotating secret can be
        # fixed before the retry window closes.
        logger.error("Bird webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.delivery_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "email.delivered":
        logger.info("Email delivered: %s to %s", data.get("email_id"), data.get("recipient"))
    elif event_type == "email.bounced":
        logger.info(
            "Email bounced: %s to %s (%s, code %s)",
            data.get("email_id"),
            data.get("recipient"),
            data.get("bounce_type"),
            data.get("bounce_code"),
        )
    elif event_type == "email.complained":
        logger.info("Email complaint: %s from %s", data.get("email_id"), data.get("recipient"))
    elif event_type == "whatsapp.received":
        logger.info(
            "WhatsApp message received: %s from %s",
            data.get("whatsapp_id"),
            (data.get("from") or {}).get("phone_number"),
        )
    elif event_type in ("preference.granted", "preference.revoked"):
        logger.info(
            "%s: %s %s (%s)",
            event_type,
            data.get("channel"),
            data.get("handle"),
            data.get("coverage"),
        )
    else:
        # Bird adds event types as products ship. Ignore ones you don't handle.
        logger.info("Unhandled Bird event type: %s", event_type)


@app.post("/webhooks/bird")
async def bird_webhook(request: Request, event: Dict[str, Any] = Depends(verified_bird_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    delivery_id = request.state.delivery_id
    if delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        # Bird waits 15 seconds for a 2xx. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        processed_delivery_ids.add(delivery_id)
    except Exception:
        logger.exception("Error handling Bird event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
