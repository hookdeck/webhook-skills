# Generated with: yoco-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Yoco webhook receiver for FastAPI.

Yoco signs webhooks (Yoco API and Checkout API) with Standard Webhooks:
  webhook-id         unique identifier for the delivery
  webhook-timestamp  Unix seconds when the delivery was signed
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import logging
import os
import time
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("yoco-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Yoco Webhook Handler")

# Yoco recommends rejecting timestamps more than 3 minutes from now. The
# standardwebhooks SDK allows 5 minutes, so check the tighter window first.
TIMESTAMP_TOLERANCE_SECONDS = 3 * 60

# In-memory dedupe for the demo. Yoco may deliver an event more than once and
# recommends tracking webhook-id. Use Redis or your database in production.
processed_webhook_ids: set = set()


def verify_yoco_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Yoco delivery with the Standard Webhooks SDK.

    The SDK (the library Yoco recommends) recomputes the HMAC over the raw
    body and compares it in constant time against every `v1,` entry. Raises
    if the timestamp is stale or the signature doesn't match.
    """
    try:
        timestamp = int(headers["webhook-timestamp"])
    except (TypeError, ValueError):
        raise ValueError("Invalid webhook-timestamp header")
    if abs(int(time.time()) - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        raise ValueError("Timestamp outside the 3-minute tolerance")
    return Webhook(secret).verify(raw_body, headers)


async def verified_yoco_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Yoco event or raises."""
    secret = os.environ.get("YOCO_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("YOCO_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body — request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_yoco_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, stale timestamp
        logger.error("Yoco webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    # Yoco API events use `event_type`; Checkout API events use `type`.
    event_type = event.get("event_type") or event.get("type")

    # --- Yoco API (POS + online): flat payload with IDs ----------------------
    if event_type == "payment.created":
        # Fetch full details with GET /v1/payments/{payment_id} if you need them.
        logger.info("Payment %s created for order %s", event.get("payment_id"), event.get("order_id"))
    elif event_type == "payment.refunded":
        logger.info("Payment %s refunded (order %s)", event.get("payment_id"), event.get("order_id"))
    elif event_type in ("order.created", "order.updated", "order.completed", "order.cancelled"):
        logger.info(
            "%s: order %s (business %s)", event_type, event.get("order_id"), event.get("business_id")
        )
    elif event_type in (
        "item.created",
        "item.updated",
        "item.deleted",
        "item_category.created",
        "item_category.updated",
        "item_category.deleted",
    ):
        logger.info("%s (business %s)", event_type, event.get("business_id"))

    # --- Checkout API: { id, type, createdDate, payload } --------------------
    # Every account-wide payment arrives here; match payload.metadata.checkoutId
    # against the checkout you created before fulfilling anything.
    elif event_type == "payment.succeeded":
        payload = event.get("payload") or {}
        logger.info(
            "Checkout %s paid: %s %s (%s)",
            (payload.get("metadata") or {}).get("checkoutId"),
            payload.get("amount"),
            payload.get("currency"),
            payload.get("id"),
        )
    elif event_type == "payment.failed":
        payload = event.get("payload") or {}
        logger.info("Checkout %s payment failed", (payload.get("metadata") or {}).get("checkoutId"))
    elif event_type == "refund.succeeded":
        payload = event.get("payload") or {}
        logger.info("Refund %s succeeded: %s cents", payload.get("id"), payload.get("amount"))
    elif event_type == "refund.failed":
        payload = event.get("payload") or {}
        logger.info("Refund %s failed: %s", payload.get("id"), payload.get("failureReason"))

    else:
        logger.info("Unhandled Yoco event type: %s", event_type)


@app.post("/webhooks/yoco")
async def yoco_webhook(request: Request, event: Dict[str, Any] = Depends(verified_yoco_event)):
    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    webhook_id = request.state.webhook_id
    if webhook_id in processed_webhook_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Yoco needs a 2xx within 15 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_webhook_ids.add(webhook_id)
    except Exception:
        logger.exception("Error handling Yoco event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
