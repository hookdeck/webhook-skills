# Generated with: salad-cloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""SaladCloud webhook receiver for FastAPI.

SaladCloud signs Job Queue webhooks with Standard Webhooks:
  webhook-id         unique delivery identifier
  webhook-timestamp  Unix seconds when the webhook was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret. SaladCloud shows the secret as bare base64
with no `whsec_` prefix; the library accepts it as is, and also accepts the
`whsec_`-prefixed form that Hookdeck needs.
Hookdeck's SaladCloud source also accepts the svix-* header names when
webhook-id is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("salad-cloud-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SaladCloud Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The body has no event id, so key on the delivery's webhook-id.
processed_delivery_ids: set = set()


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


def verify_salad_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a SaladCloud delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_salad_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified event, stashing the delivery id."""
    secret = os.environ.get("SALAD_CLOUD_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SALAD_CLOUD_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_salad_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("SaladCloud webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.delivery_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "queue.job.succeeded":
        # data is the job document. data.events[].type are lifecycle steps
        # (created, started, succeeded), not the webhook event.
        logger.info(
            "Job %s %s in queue %s (project %s, org %s)",
            data.get("id"),
            data.get("status"),
            data.get("queue_name"),
            data.get("project_name"),
            data.get("organization_name"),
        )
    else:
        # Only queue.job.succeeded is documented; failed/cancelled jobs are not covered.
        logger.info("Unhandled SaladCloud event type: %s", event_type)


@app.post("/webhooks/salad-cloud")
async def salad_cloud_webhook(request: Request, event: Dict[str, Any] = Depends(verified_salad_event)):
    # Acknowledge repeats of the same delivery with 200.
    delivery_id = request.state.delivery_id
    if delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_delivery_ids.add(delivery_id)
    except Exception:
        logger.exception("Error handling SaladCloud event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
