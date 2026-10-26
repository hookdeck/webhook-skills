# Generated with: autumn-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Autumn webhook receiver for FastAPI.

Autumn delivers webhooks through Svix:
  svix-id         message ID (same across retries)
  svix-timestamp  Unix seconds when the message was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("autumn-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Autumn Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# svix-id is the same on every retry of a message to this endpoint.
processed_message_ids: set = set()


def verify_manually(
    raw_body: bytes, headers: Dict[str, str], secret: str, tolerance: Optional[int] = None
) -> bool:
    """Manual verifier (same algorithm as svix).

    Use it when the svix library's fixed 5-minute timestamp window is a problem:
    Hookdeck retries and replays resend the original svix-timestamp. Checks every
    `v1,` entry in constant time. `tolerance` is a window in seconds, or None for none.
    """
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if tolerance is not None and abs(int(time.time()) - ts) > tolerance:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())

    ok = False
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
            ok = True
    return ok


def manual_tolerance_from_env():
    """AUTUMN_TIMESTAMP_TOLERANCE_SECONDS: unset -> (False, None) use svix; "off" -> (True, None); N -> (True, N)."""
    raw = os.environ.get("AUTUMN_TIMESTAMP_TOLERANCE_SECONDS", "").strip().lower()
    if not raw:
        return False, None
    if raw == "off":
        return True, None
    try:
        seconds = int(raw)
    except ValueError:
        return False, None
    return (True, seconds) if seconds >= 0 else (False, None)


def verify_autumn_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Autumn delivery, then parse it.

    Default: the official svix library (5-minute window, constant-time compare).
    svix 2.x `verify()` returns None (it raises on failure), so the JSON is parsed here afterwards.
    """
    use_manual, tolerance = manual_tolerance_from_env()
    if use_manual:
        if not verify_manually(raw_body, headers, secret, tolerance):
            raise ValueError("No matching signature found")
    else:
        Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_autumn_delivery(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns {"id": svix-id, "event": payload} or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("AUTUMN_WEBHOOK_SECRET")
    if not secret:
        logger.error("AUTUMN_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: the signature covers the exact bytes, so never verify request.json().
    raw_body = await request.body()
    try:
        event = verify_autumn_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("Autumn webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")
    return {"id": headers["svix-id"], "event": event}


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # customer.products.updated is the older name for plan changes.
    if event_type in ("billing.updated", "customer.products.updated"):
        for change in data.get("plan_changes") or []:
            plan = (change.get("subscription") or change.get("purchase") or {}).get("plan_id")
            entity = f"/{data['entity_id']}" if data.get("entity_id") else ""
            logger.info("Plan %s: %s for %s%s", change.get("action"), plan, data.get("customer_id"), entity)
            previous = change.get("previous_attributes") or {}
            if "canceled_at" in previous and previous["canceled_at"] is None:
                logger.info("Cancellation set for %s; deprovision when the plan expires", data.get("customer_id"))
        if "trial_ended" in (data.get("tags") or []):
            logger.info("Trial ended for %s", data.get("customer_id"))
    elif event_type == "balances.limit_reached":
        logger.info(
            "Limit reached (%s) on %s for %s", data.get("limit_type"), data.get("feature_id"), data.get("customer_id")
        )
    elif event_type == "balances.usage_alert_triggered":
        logger.info(
            'Usage alert "%s" on %s for %s',
            (data.get("usage_alert") or {}).get("name"), data.get("feature_id"), data.get("customer_id"),
        )
    elif event_type == "billing.auto_topup_succeeded":
        logger.info(
            "Auto top-up granted %s %s to %s (balance %s)",
            data.get("quantity_granted"), data.get("feature_id"), data.get("customer_id"), data.get("balance_after"),
        )
    elif event_type == "billing.auto_topup_failed":
        logger.info(
            "Auto top-up failed (%s) for %s on %s", data.get("reason"), data.get("customer_id"), data.get("feature_id")
        )
    elif event_type == "invoice.finalized":
        # The invoice fields are in `data`; fall back to the body for safety.
        logger.info(
            "Invoice finalized: %s for %s",
            data.get("stripe_id") or event.get("stripe_id"), data.get("customer_id") or event.get("customer_id"),
        )
    else:
        logger.info("Unhandled Autumn event type: %s", event_type)


@app.post("/webhooks/autumn")
async def autumn_webhook(delivery: Dict[str, Any] = Depends(verified_autumn_delivery)):
    message_id = delivery["id"]

    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast; in production enqueue the event and process it asynchronously.
        handle_event(delivery["event"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Autumn event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
