# Generated with: axilio-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Axilio webhook receiver for FastAPI.

Axilio signs webhooks with the Standard Webhooks scheme:
  webhook-id         unique per event (same value as the body's `id`)
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the destination's secret after its `whsec_` prefix.
Each Axilio destination has its own signing secret.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("axilio-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Axilio Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The body `id` equals the webhook-id header and is stable across retries.
processed_event_ids: set = set()


def signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the three signature headers.

    Axilio sends webhook-*; if webhook-id is absent the svix-* equivalents are
    used instead (Hookdeck does the same). Values are returned under the names
    the standardwebhooks library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_axilio_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Axilio delivery with the Standard Webhooks library.

    It recomputes the HMAC over the raw body, compares in constant time against
    every `v1,` entry, and rejects timestamps more than 5 minutes from now.
    Hookdeck retries and replays resend the ORIGINAL timestamp, so late retries
    fail this window; references/verification.md has a manual verifier where it
    can be dropped or widened. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_axilio_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Axilio event or raises."""
    secret = os.environ.get("AXILIO_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("AXILIO_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_axilio_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Axilio webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.event_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Runs ----------------------------------------------------------------
    if event_type in ("run.started", "run.completed", "run.failed"):
        logger.info(
            "%s: run %s (workflow %s, status %s)",
            event_type, data.get("id"), data.get("workflow_id"), data.get("status"),
        )
    elif event_type == "run.cancelled":
        # reason is `user` or `queue_timeout`
        logger.info("run.cancelled: run %s (%s)", data.get("id"), data.get("reason"))

    # --- Sessions ------------------------------------------------------------
    elif event_type == "session.started":
        logger.info("session.started: %s on phone %s", data.get("session_id"), data.get("phone_id"))
    elif event_type == "session.ended":
        # end_reason: released, idle_timeout, max_duration, run_finished, device_lost
        logger.info("session.ended: %s (%s)", data.get("session_id"), data.get("end_reason"))
    elif event_type == "session.recording_ready":
        logger.info("session.recording_ready: %s", data.get("session_id"))

    # --- Billing -------------------------------------------------------------
    elif event_type in ("balance.low", "balance.depleted", "balance.recovered"):
        logger.info("%s: balance %s (alert %s)", event_type, data.get("balance_display"), data.get("alert_id"))
    elif event_type in ("invoice.paid", "invoice.payment_failed"):
        logger.info(
            "%s: %s (%s microdollars)", event_type, data.get("invoice_number"), data.get("amount_microdollars")
        )
    elif event_type in ("subscription.updated", "subscription.canceled"):
        logger.info("%s: %s is %s", event_type, data.get("plan_name"), data.get("status"))
    elif event_type in ("auto_recharge.succeeded", "auto_recharge.failed"):
        logger.info("%s: invoice %s", event_type, data.get("stripe_invoice_id"))

    # --- Files ---------------------------------------------------------------
    elif event_type in ("file.ready", "file.capture_failed", "file.delivered", "file.delivery_failed"):
        logger.info("%s: %s (%s)", event_type, data.get("filename"), data.get("id"))

    # --- Phones (rented phones only) -----------------------------------------
    elif event_type in (
        "phone.maintenance_started",
        "phone.maintenance_ended",
        "phone.offline",
        "phone.online",
    ):
        logger.info("%s: phone %s (%s)", event_type, data.get("phone_id"), data.get("reason") or data.get("status"))
    elif event_type in ("phone.rental.activated", "phone.rental.past_due", "phone.rental.canceled"):
        logger.info("%s: rental %s for phone %s", event_type, data.get("id"), data.get("phone_id"))

    # --- Platform ------------------------------------------------------------
    elif event_type == "webhook.test":
        logger.info("webhook.test received")

    else:
        logger.info("Unhandled Axilio event type: %s", event_type)


@app.post("/webhooks/axilio")
async def axilio_webhook(request: Request, event: Dict[str, Any] = Depends(verified_axilio_event)):
    # At-least-once delivery: retries reuse the same id; acknowledge duplicates.
    event_id = request.state.event_id
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        # Order is not guaranteed: compare event["occurred_at"] when it matters.
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
