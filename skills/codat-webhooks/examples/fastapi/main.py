# Generated with: codat-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Codat webhook receiver for FastAPI.

Codat delivers webhooks through Svix using the Standard Webhooks header names:
  webhook-id         unique message ID (stable across retries)
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
NOTE: these are webhook-*, not svix-*.
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("codat-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Codat Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Dedupe on the webhook-id header, which is the same on every retry.
processed_message_ids: set = set()


def verify_codat_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Codat delivery with the Standard Webhooks library.

    Checks the timestamp (5-minute tolerance), recomputes the HMAC over the raw
    body, and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_codat_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Codat event or raises."""
    secret = os.environ.get("CODAT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("CODAT_WEBHOOK_SECRET is not set; rejecting delivery")
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
        event = verify_codat_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Codat webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("eventType") or event.get("type")
    payload = event.get("payload") or {}

    if event_type == "company.created":
        company = payload.get("referenceCompany") or {}
        logger.info("Company created: %s", company.get("id") or payload.get("companyId") or "unknown")
    elif event_type in ("connection.created", "connection.connected"):
        connection = payload.get("connection") or {}
        logger.info("%s: %s", event_type, connection.get("id") or payload.get("connectionId") or "unknown")
    elif event_type == "read.completed":
        logger.info("Read completed%s", f" for {payload['dataType']}" if payload.get("dataType") else "")
    elif event_type == "write.successful":
        logger.info("Write successful")
    else:
        logger.info("Unhandled Codat event type: %s", event_type)


@app.post("/webhooks/codat")
async def codat_webhook(request: Request, event: Dict[str, Any] = Depends(verified_codat_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.webhook_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Codat event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
