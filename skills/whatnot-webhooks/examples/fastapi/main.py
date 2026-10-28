# Generated with: whatnot-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Whatnot webhook receiver for FastAPI.

Whatnot signs webhooks with Standard Webhooks:
  webhook-id         UUID, unique per event and reused on retries (dedupe key)
  webhook-timestamp  Unix seconds when this attempt was sent (5-minute tolerance)
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the dashboard secret after its `wn_wh_` prefix.
The library strips only its own `whsec_` prefix, so strip `wn_wh_` first:
left on, it silently decodes to the wrong key and every check fails.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("whatnot-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Whatnot Webhook Handler")

SECRET_PREFIX = "wn_wh_"
SIGNATURE_HEADERS = ("webhook-id", "webhook-timestamp", "webhook-signature")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Delivery is at least once, and retries reuse the webhook-id header.
processed_webhook_ids: set = set()


def verify_whatnot_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Whatnot delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret.removeprefix(SECRET_PREFIX)).verify(raw_body, headers)


async def verified_whatnot_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Whatnot event or raises."""
    secret = os.environ.get("WHATNOT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("WHATNOT_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {name: request.headers.get(name) for name in SIGNATURE_HEADERS}
    if not all(headers.values()):
        raise HTTPException(
            status_code=400, detail="Missing webhook-id, webhook-timestamp or webhook-signature header"
        )

    # Raw body: request.json() would re-serialise Whatnot's space-separated
    # JSON and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_whatnot_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, malformed entries, bad base64
        logger.error("Whatnot webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return event


def format_money(money: Optional[dict]) -> str:
    # Money is {"amount": "49.77", "currency": "USD"}. Keep amount as a string
    # (or decimal.Decimal), never a float.
    return f"{money['amount']} {money['currency']}" if money else "n/a"


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Orders (read:orders) ------------------------------------------------
    if event_type in ("orders.created", "orders.updated"):
        # No ordering guarantee: orders.updated can arrive before orders.created.
        # Compare data["updated_at"] with what you stored before overwriting.
        total = (data.get("amounts") or {}).get("total")
        logger.info("%s: order %s (%s), total %s", event_type, data.get("id"), data.get("status"), format_money(total))
        if data.get("cancelled_at"):
            logger.info("Order %s cancelled at %s", data.get("id"), data["cancelled_at"])
        # buyer is None unless your app holds read:customers.
        if data.get("buyer"):
            logger.info("Buyer %s", data["buyer"].get("username"))

    # --- Shows (read:shows) --------------------------------------------------
    elif event_type in ("shows.created", "shows.updated"):
        # created excludes rehearsals; updated fires even when only updated_at changed.
        logger.info('%s: show %s "%s" (%s)', event_type, data.get("id"), data.get("title"), data.get("status"))
    elif event_type in ("shows.started", "shows.ended", "shows.cancelled"):
        # started also fires when a stopped show resumes; ended includes
        # Whatnot ending an abandoned show.
        logger.info("%s: show %s", event_type, data.get("show_id"))

    # --- Merchandising (read:merchandising) ----------------------------------
    elif event_type in ("merchandising.products.added_to_show", "merchandising.products.removed_from_show"):
        # removed_from_show also fires when the listing was deleted.
        logger.info("%s: product %s in show %s", event_type, data.get("product_id"), data.get("show_id"))

    # --- Shipments (read:shipments) ------------------------------------------
    elif event_type == "shipments.created":
        # recipient, destination_address and documents need read:customers.
        logger.info("Shipment %s created (%s)", data.get("id"), data.get("status"))
        if data.get("recipient"):
            logger.info("Recipient %s", data["recipient"].get("username"))
    elif event_type == "shipments.label_generated":
        # documents is None without read:customers and customer-address access.
        tracking = data.get("tracking") or {}
        logger.info(
            "Shipment %s label %s: %s %s",
            data.get("shipment_id"), data.get("reason"), tracking.get("carrier"), tracking.get("tracking_code"),
        )
        documents = data.get("documents") or {}
        if documents.get("label_url"):
            logger.info("Label: %s", documents["label_url"])
    elif event_type == "shipments.tracking_code_added":
        tracking = data.get("tracking") or {}
        logger.info("Shipment %s tracking: %s %s", data.get("shipment_id"), tracking.get("carrier"), tracking.get("tracking_code"))
    elif event_type == "shipments.parcel_updated":
        logger.info("Shipment %s parcel updated", data.get("shipment_id"))
    elif event_type in ("shipments.items.added", "shipments.items.removed"):
        # shipment_item_ids lists every item on the shipment after the change.
        items = data.get("shipment_item_ids") or []
        logger.info("%s: shipment %s now has %d items", event_type, data.get("shipment_id"), len(items))

    # --- Products (read:inventory) -------------------------------------------
    elif event_type in ("products.created", "products.updated"):
        # products.updated doesn't say which fields changed.
        logger.info('%s: product %s "%s"', event_type, data.get("id"), data.get("title"))
    elif event_type == "products.deleted":
        logger.info("Product %s deleted", data.get("id"))

    else:
        # Whatnot adds topics over time: acknowledge, don't fail (an error is retried).
        logger.info("Unhandled Whatnot event type: %s", event_type)

    # seller_id is in the signed body; multi-seller apps route on it.
    logger.info("(seller %s)", event.get("seller_id"))


@app.post("/webhooks/whatnot")
async def whatnot_webhook(request: Request, event: Dict[str, Any] = Depends(verified_whatnot_event)):
    # Retries reuse webhook-id; acknowledge duplicates with a 2xx.
    webhook_id = request.headers.get("webhook-id")
    if webhook_id in processed_webhook_ids:
        return {"received": True, "duplicate": True}

    try:
        # Whatnot times out after 5 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        processed_webhook_ids.add(webhook_id)
    except Exception:
        logger.exception("Error handling Whatnot event")
        raise HTTPException(status_code=500, detail="Internal server error")

    # Any 2xx counts as delivered.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
