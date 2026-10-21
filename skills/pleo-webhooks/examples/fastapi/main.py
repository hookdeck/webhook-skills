# Generated with: pleo-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Pleo webhook receiver for FastAPI.

Pleo delivers webhooks through Svix, using Standard Webhooks headers:
  webhook-id         unique message id (same value when a delivery is retried)
  webhook-timestamp  Unix seconds when the delivery was sent
  webhook-signature  "v1,<base64 signature>" (space-delimited list)
Pleo's docs don't spell out the signed content. Svix (and Standard Webhooks)
sign f"{webhook-id}.{webhook-timestamp}.{raw_body}" with HMAC-SHA256, keyed
with the base64-decoded part of the `whsec_` secret after the prefix.

The secret comes from GET /v1/subscriptions/{id}/secret (data.secretKey).
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("pleo-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Pleo Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Pleo retries failed deliveries for about 27.5 hours with the same webhook-id.
processed_message_ids: set = set()


def verify_pleo_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Pleo delivery with the Standard Webhooks library.

    Pleo has no webhook SDK of its own. The library rejects timestamps more
    than 5 minutes off, recomputes the HMAC over the raw body, and compares in
    constant time against every `v1,` entry. Raises if verification fails.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_pleo_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Pleo event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("PLEO_WEBHOOK_SECRET")
    if not secret:
        logger.error("PLEO_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_pleo_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Pleo webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("eventType")
    event_id = event.get("eventId")
    data = event.get("data") or {}

    if event_type == "v1.export-job.created":
        # A user clicked Export in Pleo. Fetch the job's items and push them to
        # the accounting system, instead of polling GET /v2/export-jobs.
        logger.info(
            "Export job %s created for company %s (%s items, status=%s, event %s)",
            data.get("id"),
            data.get("companyId"),
            data.get("numberOfItems"),
            data.get("status"),
            event_id,
        )
    elif event_type == "v1.vendor.created":
        # A DRAFT vendor was added in Pleo. Create it in the accounting system,
        # then activate it in Pleo. The payload already holds the vendor details.
        logger.info(
            'Vendor %s "%s" created (state=%s, event %s)',
            data.get("id"),
            data.get("name"),
            data.get("state"),
            event_id,
        )
    else:
        logger.info("Unhandled Pleo event type: %s", event_type)


@app.post("/webhooks/pleo")
async def pleo_webhook(request: Request, event: Dict[str, Any] = Depends(verified_pleo_event)):
    # Retries reuse the webhook-id, so acknowledge duplicates with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Pleo event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
