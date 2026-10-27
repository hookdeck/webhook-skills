# Generated with: skovik-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Skovik webhook receiver for FastAPI.

Skovik delivers webhooks with Standard Webhooks signatures:
  webhook-id         delivery id, the same on every retry of a delivery
  webhook-timestamp  Unix seconds when this attempt was signed
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Each webhook endpoint has its own signing secret.
Hookdeck's Skovik source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("skovik-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Skovik Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# data.id is the event id: the same on every retry and on every endpoint.
processed_event_ids: set = set()


def resolve_signature_headers(headers) -> Optional[Dict[str, str]]:
    """Read the three signature headers: webhook-* first, svix-* when
    webhook-id is absent. Returns them under the webhook-* names the library
    expects, or None if any is missing."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {
        "webhook-id": msg_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
    }


def verify_skovik_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Skovik delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_skovik_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Skovik event or raises."""
    secret = os.environ.get("SKOVIK_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SKOVIK_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_skovik_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Skovik webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # The delivery is a thin notification: the related resource is only linked.
    # Fetch its current state from the `related` URL instead of trusting a snapshot.
    event_type = event.get("type")
    data = event.get("data") or {}
    related = ((data.get("relationships") or {}).get("related_object") or {}).get("data")
    resource = f"{related.get('type')}/{related.get('id')}" if related else "no related resource"

    # --- Users ---------------------------------------------------------------
    if event_type in ("users.created", "users.updated", "users.archived"):
        logger.info("%s: %s", event_type, resource)

    # --- Export orders -------------------------------------------------------
    elif event_type == "export_orders.created":
        logger.info("Export order created: %s", resource)
    elif event_type == "export_orders.completed":
        # Fetch the export order to get the URL of the export file.
        logger.info("Export order completed: %s", resource)
    elif event_type == "export_orders.failed":
        # Fetch the export order and read its `error_message` attribute.
        logger.info("Export order failed: %s", resource)

    # --- Branches ------------------------------------------------------------
    elif event_type in ("branches.created", "branches.updated", "branches.archived"):
        logger.info("%s: %s", event_type, resource)

    # --- Test event ----------------------------------------------------------
    elif event_type == "misc.ping":
        # Sent from the settings UI to test an endpoint. It is signed like any
        # other delivery, is never retried, and has no related resource.
        logger.info("Skovik ping received")

    else:
        # The documented list may not be exhaustive: acknowledge unknown types.
        logger.info("Unhandled Skovik event type: %s", event_type)


@app.post("/webhooks/skovik")
async def skovik_webhook(event: Dict[str, Any] = Depends(verified_skovik_event)):
    # Delivery is at-least-once; acknowledge duplicates with 200.
    event_id = (event.get("data") or {}).get("id")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Skovik times out after 5 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        if event_id:
            processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Skovik event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
