# Generated with: axilio-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Axilio webhook receiver for FastAPI.

Axilio signs deliveries with Standard Webhooks:
  webhook-id         unique message identifier (equals the body's `id`)
  webhook-timestamp  Unix seconds when the delivery was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.

Axilio shows the secret once, when you register the destination.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("axilio-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Axilio Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The body `id` (= webhook-id) is the same every time one change is delivered.
processed_event_ids: set = set()


def verify_axilio_webhook(
    raw_body: bytes, headers: Dict[str, str], secret: Optional[str] = None
) -> Dict[str, Any]:
    """Verify an Axilio delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,`
    entry. Retries and replays resend the ORIGINAL timestamp, so this rejects
    a retry that lands more than 5 minutes after the first attempt; see
    references/verification.md for a manual verifier with a configurable
    window. Raises if the delivery does not verify.
    """
    secret = secret or os.environ.get("AXILIO_WEBHOOK_SECRET")
    if not secret:
        raise ValueError("AXILIO_WEBHOOK_SECRET is not set")
    return Webhook(secret).verify(raw_body, headers)


async def verified_axilio_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Axilio event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not os.environ.get("AXILIO_WEBHOOK_SECRET"):
        logger.error("AXILIO_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC. Reading
    # bytes works for any content type.
    raw_body = await request.body()

    try:
        return verify_axilio_webhook(raw_body, headers)
    except Exception as err:  # WebhookVerificationError, bad base64, bad JSON, etc.
        logger.error("Axilio webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # Envelope: {id, type, occurred_at, test, data}. `data` uses the API's
    # field names and carries ids, statuses, reasons and timestamps only.
    event_type = event.get("type")
    data = event.get("data") or {}

    if event.get("test"):
        # Sent from the dashboard's Test button: acknowledge, don't act on it.
        logger.info("Test delivery received: %s", event_type)
        return

    # --- Runs (data.id = run id) ---------------------------------------------
    if event_type == "run.started":
        logger.info("Run %s started", data.get("id"))
    elif event_type == "run.completed":
        # Fetch the run through the API for outputs; the payload has none.
        logger.info("Run %s completed", data.get("id"))
    elif event_type == "run.failed":
        logger.info("Run %s failed", data.get("id"))
    elif event_type == "run.cancelled":
        # data.reason is "user" or "queue_timeout".
        logger.info("Run %s cancelled (%s)", data.get("id"), data.get("reason"))

    # --- Sessions ------------------------------------------------------------
    elif event_type == "session.started":
        logger.info("Session %s started", data.get("session_id"))
    elif event_type == "session.ended":
        # data.end_reason: released, idle_timeout, max_duration, run_finished, device_lost.
        logger.info("Session %s ended (%s)", data.get("session_id"), data.get("end_reason"))
    elif event_type == "session.recording_ready":
        logger.info("Recording ready for session %s", data.get("session_id"))

    # --- Billing -------------------------------------------------------------
    elif event_type in ("balance.low", "balance.depleted", "balance.recovered"):
        logger.info("%s: balance %s", event_type, data.get("balance_display"))
    elif event_type in ("invoice.paid", "invoice.payment_failed"):
        logger.info("%s: invoice %s", event_type, data.get("stripe_invoice_id"))
    elif event_type in ("subscription.updated", "subscription.canceled"):
        logger.info(
            "%s: subscription %s is %s", event_type, data.get("subscription_id"), data.get("status")
        )
    elif event_type in ("auto_recharge.succeeded", "auto_recharge.failed"):
        # After a failure Axilio turns auto-recharge off until you re-enable it.
        logger.info("%s: invoice %s", event_type, data.get("stripe_invoice_id"))

    # --- Files ---------------------------------------------------------------
    elif event_type in ("file.ready", "file.capture_failed", "file.delivered", "file.delivery_failed"):
        logger.info("%s: file %s", event_type, data.get("file_id") or data.get("id"))

    # --- Phones (rented phones only) -----------------------------------------
    elif event_type in (
        "phone.maintenance_started",
        "phone.maintenance_ended",
        "phone.offline",
        "phone.online",
    ):
        logger.info("%s: phone %s", event_type, data.get("phone_id"))
    elif event_type in ("phone.rental.activated", "phone.rental.past_due", "phone.rental.canceled"):
        logger.info("%s: rental %s", event_type, data.get("id"))

    elif event_type == "webhook.test":
        logger.info("webhook.test received")

    else:
        # Axilio may add event types over time.
        logger.info("Unhandled Axilio event type: %s", event_type)


@app.post("/webhooks/axilio")
async def axilio_webhook(event: Dict[str, Any] = Depends(verified_axilio_event)):
    # Redelivery is normal (at-least-once delivery, replays from the dashboard).
    event_id = event.get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Respond 2xx quickly. In production, store or enqueue the event here
        # and do slow work afterwards.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Axilio event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
