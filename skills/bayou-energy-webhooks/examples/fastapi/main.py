# Generated with: bayou-energy-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Bayou Energy webhook receiver for FastAPI.

Bayou signs webhooks per the Standard Webhooks spec:
  webhook-id         unique message ID (stable across retries)
  webhook-timestamp  Unix seconds when the message was sent
  webhook-signature  one or more space-separated "v1,<base64>" entries
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}", HMAC-SHA256.
Key: base64-decode of the company secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

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


def signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the three signature headers.

    Bayou sends webhook-*; like Hookdeck, fall back to the svix-* names when
    webhook-id is absent. The result always uses the webhook-* names, which is
    what the standardwebhooks library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_bayou_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Bayou delivery with the Standard Webhooks library.

    It enforces a fixed 5-minute timestamp window, recomputes the HMAC over the
    raw body and compares in constant time against every `v1,` entry. Raises on
    failure.

    Hookdeck retries and replays resend the ORIGINAL timestamp, so this rejects
    a retry that arrives more than 5 minutes after the first attempt. See
    references/verification.md for a manual verifier with a configurable window.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_bayou_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Bayou event or raises."""
    secret = os.environ.get("BAYOU_ENERGY_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        payload = verify_bayou_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, bad timestamp, etc.
        logger.error("Bayou webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.message_id = headers["webhook-id"]
    return payload


def handle_event(payload: Dict[str, Any]) -> None:
    event = payload.get("event")
    obj = payload.get("object") or {}

    # Avoid logging object.file_url (pre-signed bill URL) or object.onboarding_token.
    if event in ("new_bill", "updated_bill"):
        logger.info(
            "%s: bill %s for customer %s (%s), total %s, status %s",
            event,
            obj.get("id"),
            obj.get("customer_id"),
            obj.get("utility"),
            obj.get("total_amount"),
            obj.get("status"),
        )
    elif event == "bills_ready":
        # object is the customer; bills_parsed holds the initial bills.
        logger.info(
            "Bills ready for customer %s: %d bills", obj.get("id"), len(obj.get("bills_parsed") or [])
        )
    elif event == "intervals_ready":
        logger.info(
            "Intervals ready for customer %s: %s to %s",
            obj.get("id"),
            obj.get("first_interval_discovered"),
            obj.get("last_interval_discovered"),
        )
    elif event == "customer_has_filled_credentials":
        logger.info("Customer %s shared %s credentials", obj.get("id"), obj.get("utility"))
    elif event == "new_unparsed_bill":
        # The bill exists but isn't parsed yet; wait for updated_bill.
        logger.info(
            "Unparsed bill %s for customer %s (%s)",
            obj.get("id"),
            obj.get("customer_id"),
            obj.get("utility"),
        )
    elif event == "customer_must_reauthenticate":
        # reason: credentials_are_invalid or mfa_factor_has_expired
        logger.info("Customer %s must re-authenticate: %s", obj.get("id"), obj.get("reason"))
    else:
        logger.info("Unhandled Bayou event: %s", event)


@app.post("/webhooks/bayou-energy")
async def bayou_energy_webhook(
    request: Request, payload: Dict[str, Any] = Depends(verified_bayou_event)
):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.message_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(payload)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Bayou event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
