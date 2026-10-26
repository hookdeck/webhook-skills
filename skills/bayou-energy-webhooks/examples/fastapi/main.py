# Generated with: bayou-energy-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Bayou Energy webhook receiver for FastAPI.

Bayou Energy signs webhooks per the Standard Webhooks spec:
  webhook-id         unique message ID
  webhook-timestamp  Unix seconds when the webhook was sent
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the company's secret after its `whsec_` prefix.
Body: {"event": ..., "object": ...}
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("bayou-energy-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bayou Energy Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Bayou payloads carry no event ID, so dedupe on the webhook-id header.
processed_message_ids: set = set()


def verify_bayou_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Bayou Energy delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_bayou_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Bayou event or raises."""
    secret = os.environ.get("BAYOU_ENERGY_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery")
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
        payload = verify_bayou_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Bayou Energy webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return payload


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")
    obj = payload.get("object") or {}

    # --- Bills ---------------------------------------------------------------
    if event == "new_bill":
        logger.info(
            "New bill %s for customer %s (%s)", obj.get("id"), obj.get("customer_id"), obj.get("utility")
        )
    elif event == "updated_bill":
        logger.info("Updated bill %s for customer %s", obj.get("id"), obj.get("customer_id"))
    elif event == "new_unparsed_bill":
        # Bill found but not parsed yet; object.file_url is a short-lived link.
        logger.info("New unparsed bill %s for customer %s", obj.get("id"), obj.get("customer_id"))

    # --- Customer data readiness ---------------------------------------------
    elif event == "bills_ready":
        logger.info("Bills ready for customer %s: %d parsed", obj.get("id"), len(obj.get("bills_parsed") or []))
    elif event == "intervals_ready":
        logger.info(
            "Intervals ready for customer %s: %s to %s",
            obj.get("id"),
            obj.get("first_interval_discovered"),
            obj.get("last_interval_discovered"),
        )

    # --- Customer credentials ------------------------------------------------
    elif event == "customer_has_filled_credentials":
        logger.info("Customer %s shared credentials for %s", obj.get("id"), obj.get("utility"))
    elif event == "customer_must_reauthenticate":
        # reason: credentials_are_invalid or mfa_factor_has_expired
        logger.info("Customer %s must re-authenticate (%s)", obj.get("id"), obj.get("reason"))

    else:
        logger.info("Unhandled Bayou Energy event: %s", event)


@app.post("/webhooks/bayou-energy")
async def bayou_energy_webhook(request: Request, payload: Dict[str, Any] = Depends(verified_bayou_event)):
    # Acknowledge duplicates (same webhook-id) with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(payload)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Bayou Energy event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
