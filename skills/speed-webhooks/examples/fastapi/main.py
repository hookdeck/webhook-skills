# Generated with: speed-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Speed (tryspeed.com) webhook receiver for FastAPI.

Speed signs webhooks with Standard Webhooks:
  webhook-id         the delivery ID (new on every retry)
  webhook-timestamp  Unix seconds when this attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its prefix. Speed shows the
secret as `wsec_<base64>`; the library only strips `whsec_`, so swap the prefix.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("speed-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Speed Webhook Handler")


# In-memory dedupe for the demo. Use Redis or your database in production.
# Speed re-signs retries with a NEW webhook-id, so dedupe on the event `id` (evt_...).
processed_event_ids: set = set()


def to_standard_secret(secret: str) -> str:
    """Speed shows the secret with a wsec_ prefix. The standardwebhooks library
    only understands whsec_, so turn a leading wsec_ into whsec_."""
    return "whsec_" + secret[len("wsec_"):] if secret.startswith("wsec_") else secret


def read_signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the signature headers.

    Standard Webhooks uses webhook-*; when webhook-id is absent, fall back to
    the svix-* names, as Hookdeck does. Returned under the webhook-* names the
    library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_speed_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Speed delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(to_standard_secret(secret)).verify(raw_body, headers)


async def verified_speed_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Speed event or raises."""
    secret = os.environ.get("SPEED_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SPEED_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = read_signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Standard Webhooks signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_speed_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Speed webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return event


PAYMENT_EVENTS = (
    "payment.created",
    "payment.paid",
    "payment.confirmed",
    "payment.expired",
    "payment.cancelled",
)
STATUS_EVENTS = (
    "checkout_session.created",
    "checkout_session.paid",
    "checkout_session.payment_paid",
    "checkout_session.deactivated",
    "checkout_link.created",
    "checkout_link.paid",
    "checkout_link.deactivated",
    "withdraw.created",
    "withdraw.paid",
    "withdraw.failed",
    "withdrawal_link.created",
    "withdrawal_link.paid",
    "withdrawal_link.deactivated",
    "withdraw_request.created",
    "withdraw_request.paid",
    "withdraw_request.deactivated",
)
ID_ONLY_EVENTS = (
    "payment_link.created",
    "payment_link.paymentreceived",
    "payment_link.deactivated",
    "payment_address.paymentreceived",
    "payrequest.payment_paid",
    "invoice.paid",
)


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event_type")
    data = event.get("data") or {}
    obj = data.get("object") or {}

    # --- Payments ------------------------------------------------------------
    if event_type in PAYMENT_EVENTS:
        logger.info(
            "%s: %s (%s %s, status=%s)",
            event_type, obj.get("id"), obj.get("amount"), obj.get("currency"), obj.get("status"),
        )

    # --- Checkout sessions/links and withdrawals -----------------------------
    elif event_type in STATUS_EVENTS:
        logger.info("%s: %s (status=%s)", event_type, obj.get("id"), obj.get("status"))

    # --- Payment links, addresses, payrequests, invoices ---------------------
    elif event_type in ID_ONLY_EVENTS:
        logger.info("%s: %s", event_type, obj.get("id"))

    # --- Connect (events for connected accounts carry data.account_id) -------
    elif event_type == "connect.completed":
        logger.info("%s: %s", event_type, obj.get("id") or data.get("account_id"))

    else:
        # Speed's event list may grow: acknowledge, don't fail.
        logger.info("Unhandled Speed event type: %s", event_type)


@app.post("/webhooks/speed")
async def speed_webhook(request: Request, event: Dict[str, Any] = Depends(verified_speed_event)):
    # Retries get a new webhook-id but keep the event id; acknowledge duplicates with 200.
    event_id = event.get("id") or request.headers.get("webhook-id") or request.headers.get("svix-id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Reply 2xx quickly: any other status is retried. In production, enqueue the
        # event here and process it asynchronously. Compare event["modified"] before
        # overwriting newer data.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Speed event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
