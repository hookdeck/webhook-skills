# Generated with: pipeline-crm-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Pipeline CRM webhook receiver for FastAPI.

Pipeline CRM signs deliveries with Standard Webhooks (opt-in per endpoint:
Request signing > Enable signing on the automation's Call an API action):
  webhook-id         unique delivery ID (stable across retries)
  webhook-timestamp  Unix seconds when this attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("pipeline-crm-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Pipeline CRM Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The payload carries no event ID, so dedupe on the webhook-id header.
processed_delivery_ids: set = set()


def verify_pipeline_crm_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Pipeline CRM delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute window), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.

    Hookdeck retries and replays resend the ORIGINAL webhook-timestamp, so this
    library rejects them after 5 minutes. See references/verification.md for a
    manual verifier where the window can be dropped or widened.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Pipeline CRM event or raises."""
    secret = os.environ.get("PIPELINE_CRM_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("PIPELINE_CRM_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    # Signing is opt-in; unsigned deliveries have no webhook-* headers.
    if not all(headers.values()):
        raise HTTPException(
            status_code=400, detail="Missing webhook signature headers (is signing enabled?)"
        )

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_pipeline_crm_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Pipeline CRM webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.delivery_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    # The body has no event type string; combine event_model and event_action.
    event_type = f"{event.get('event_model')}.{event.get('event_action')}"
    model_id = event.get("event_model_id")
    data = event.get("event_data") or {}

    if event_type == "deal.create":
        logger.info("Deal created: %s (%s)", model_id, data.get("name"))
    elif event_type == "deal.update":
        # event_changes maps each changed field to [old, new]
        logger.info(
            "Deal updated: %s changes: %s", model_id, ", ".join((event.get("event_changes") or {}).keys())
        )
    elif event_type == "deal.destroy":
        logger.info("Deal deleted: %s", model_id)
    elif event_type == "person.create":
        logger.info("Person created: %s", model_id)
    elif event_type == "person.update":
        logger.info("Person updated: %s", model_id)
    elif event_type == "person.destroy":
        logger.info("Person deleted: %s", model_id)
    elif event_type == "company.create":
        logger.info("Company created: %s", model_id)
    elif event_type == "company.update":
        logger.info("Company updated: %s", model_id)
    elif event_type == "company.destroy":
        logger.info("Company deleted: %s", model_id)
    else:
        logger.info("Unhandled Pipeline CRM event: %s", event_type)


@app.post("/webhooks/pipeline-crm")
async def pipeline_crm_webhook(request: Request, event: Dict[str, Any] = Depends(verified_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    delivery_id = request.state.delivery_id
    if delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        # Pipeline CRM expects a 2xx within a few seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_delivery_ids.add(delivery_id)
    except Exception:
        logger.exception("Error handling Pipeline CRM event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
