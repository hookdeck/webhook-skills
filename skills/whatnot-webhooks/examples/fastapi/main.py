# Generated with: whatnot-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Whatnot Seller API webhook receiver for FastAPI.

WHATNOT WEBHOOK VERIFICATION

  header    : X-Whatnot-Webhook-Signature: <lowercase hex HMAC-SHA256>
  algorithm : HMAC-SHA256, keyed with your app's webhook secret key
              (provided by a Whatnot representative)
  signed    : the RAW request body, nothing else (no timestamp, no prefix)
  encoding  : hex digest, no "sha256=" prefix

Whatnot's own Python sample compares with `==`. This uses
hmac.compare_digest instead, so the check doesn't leak timing information.
"""

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("whatnot-webhooks")

app = FastAPI(title="Whatnot Webhook Handler")

_HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def verify_whatnot_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """True only if `signature` is the hex HMAC-SHA256 of the exact raw body."""
    if not signature or not secret:
        return False

    # Hex is case-insensitive; normalise before comparing.
    received = signature.strip().lower()
    if not _HEX_SHA256.match(received):  # rejects base64, prefixes, wrong length
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received, expected)


async def verified_whatnot_body(request: Request) -> bytes:
    """FastAPI dependency: returns the raw body only if Whatnot signed it."""
    secret = os.environ.get("WHATNOT_WEBHOOK_SECRET")
    if not secret:
        logger.error("WHATNOT_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-whatnot-webhook-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Whatnot-Webhook-Signature header")

    # Raw bytes: the HMAC is computed over exactly what Whatnot sent.
    raw_body = await request.body()
    if not verify_whatnot_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


# Idempotency: Whatnot retries any non-200 response up to 5 times over ~10
# minutes, so the same envelope `id` can arrive more than once.
# Use a database or Redis in production.
processed_events: set = set()


def format_money(money: Optional[dict]) -> str:
    # Money is {"amount": "12.34", "currency": "USD"}. Keep amount as a string
    # (or decimal.Decimal), never a float.
    return f"{money['amount']} {money['currency']}" if money else "n/a"


def handle_order(topic: str, order: dict) -> None:
    logger.info("%s: order %s, total %s", topic, order.get("order_id"), format_money(order.get("total")))
    if order.get("cancelled_at"):
        logger.info("Order %s cancelled at %s", order.get("order_id"), order["cancelled_at"])
    # shipping_address and tracking_info are only populated for apps with the
    # read_customers scope. Otherwise they're null or missing.
    address = order.get("shipping_address")
    if address:
        logger.info("Ship to %s, %s", address.get("city"), address.get("country"))
    tracking = order.get("tracking_info")
    if tracking:
        logger.info("Tracking %s %s", tracking.get("courier"), tracking.get("tracking_code"))


def handle_event(event: dict, seller_id: Optional[str]) -> None:
    topic = event.get("topic")
    obj = event.get("object") or {}

    if topic == "product/sold":
        # Decrement stock in your own system for product_id / variant_id.
        logger.info("Product %s sold (qty %s), order %s", obj.get("product_id"), obj.get("quantity"), obj.get("order_id"))
    elif topic == "bulk_operation/finished":
        logger.info("Bulk operation %s finished with status %s", obj.get("id"), obj.get("status"))
    elif topic in ("listing/created", "listing/updated"):
        logger.info("%s: listing %s (%s, %s)", topic, obj.get("listing_id"), obj.get("transaction_type"), obj.get("listing_status"))
    elif topic in ("order/created", "order/updated"):
        handle_order(topic, obj)
    elif topic == "livestream/created":
        logger.info("Livestream %s created: %s", obj.get("livestream_id"), obj.get("title"))
    elif topic == "livestream/stopped":
        # Fires when a livestream ends OR is cancelled.
        logger.info("Livestream %s stopped", obj.get("livestream_id"))
    elif topic in ("livestream/product_added", "livestream/product_removed"):
        logger.info("%s: listing %s in livestream %s", topic, obj.get("listing_id"), obj.get("livestream_id"))
    elif topic == "shipment/label_created":
        # BETA topic: Whatnot says it may change without notice.
        # label_url needs the read_customers scope.
        logger.info("Shipment %s label (%s): %s %s", obj.get("shipment_id"), obj.get("reason"), obj.get("courier"), obj.get("tracking_code"))
    else:
        # Whatnot is in development preview and may add topics. Acknowledge
        # unknown ones with 200: an error would only trigger 5 retries.
        logger.info("Unhandled Whatnot topic: %s", topic)

    if seller_id:
        logger.info("(seller %s)", seller_id)


@app.post("/webhooks/whatnot")
async def whatnot_webhook(request: Request, raw_body: bytes = Depends(verified_whatnot_body)):
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_id = event.get("id")
    if event_id in processed_events:
        return {"received": True, "duplicate": True}

    # X-Whatnot-Seller-Id tells a multi-seller app which seller this is for.
    handle_event(event, request.headers.get("x-whatnot-seller-id"))
    processed_events.add(event_id)

    # Whatnot expects exactly 200 OK. Anything else is retried.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
