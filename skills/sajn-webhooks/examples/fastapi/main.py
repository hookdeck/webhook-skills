# Generated with: sajn-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""sajn (sajn.se) webhook receiver for FastAPI.

sajn signs webhooks with Standard Webhooks (API version 2026-10+):
  webhook-id         the event ID (stable across retries)
  webhook-timestamp  Unix seconds when this attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Endpoints on the deprecated 2026-09 API version send X-Sajn-Signature instead.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("sajn-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="sajn Webhook Handler")

API_VERSION_HINT = (
    "Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the "
    "deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks "
    "and fail verification."
)

# In-memory dedupe for the demo. Use Redis or your database in production.
# The event id is the same on every retry, replay and endpoint.
processed_event_ids: set = set()


def read_signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the signature headers.

    Standard Webhooks uses webhook-*; when webhook-id is absent, fall back to
    the svix-* names, as Hookdeck does. Returned under the webhook-* names the
    library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_sajn_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a sajn delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_sajn_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified sajn event or raises."""
    secret = os.environ.get("SAJN_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SAJN_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = read_signature_headers(request.headers)
    if not all(headers.values()):
        # This also answers the unsigned {"test": true} POST the dashboard sends when you save a webhook.
        detail = "Missing Standard Webhooks signature headers."
        if request.headers.get("x-sajn-signature"):
            detail += " " + API_VERSION_HINT
        raise HTTPException(status_code=400, detail=detail)

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_sajn_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("sajn webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}
    obj = data.get("object") or {}
    party = data.get("party") or {}

    # --- Documents -----------------------------------------------------------
    if event_type == "document.sent":
        logger.info("Document sent: %s (%s)", obj.get("id"), obj.get("name"))
    elif event_type == "document.fully_signed":
        # Every party has signed, but the PDF is not sealed yet.
        logger.info("Document fully signed: %s", obj.get("id"))
    elif event_type == "document.completed":
        # The sealed PDF is ready: download the signed file here.
        logger.info("Document completed: %s (%s)", obj.get("id"), obj.get("name"))
    elif event_type in ("document.rejected", "document.expired", "document.withdrawn"):
        logger.info("%s: %s", event_type, obj.get("id"))
    elif event_type == "document.expiring_soon":
        logger.info("Document expiring soon: %s (expires %s)", obj.get("id"), obj.get("expiresAt"))

    # --- Parties -------------------------------------------------------------
    elif event_type == "document.party.signed":
        logger.info("Party %s signed document %s", party.get("id"), obj.get("id"))
    elif event_type == "document.party.rejected":
        logger.info("Party %s rejected document %s", party.get("id"), obj.get("id"))
    elif event_type == "document.party.delivery_failed":
        # The invitation email bounced or the SMS failed.
        logger.info("Invitation to party %s failed on document %s", party.get("id"), obj.get("id"))

    # --- Approvals -----------------------------------------------------------
    elif event_type in (
        "approval_request.created",
        "approval_request.approved",
        "approval_request.rejected",
        "approval_request.cancelled",
    ):
        logger.info("%s: %s", event_type, obj.get("id"))

    # --- Identity checks -----------------------------------------------------
    elif event_type == "identity_check.verified":
        logger.info("Identity check verified: %s", obj.get("id"))
    elif event_type == "identity_check.failed":
        logger.info("Identity check failed: %s (%s)", obj.get("id"), data.get("failureReason"))

    # --- Forms, usage, test --------------------------------------------------
    elif event_type == "form.submitted":
        logger.info("Form submission: %s", obj.get("id"))
    elif event_type == "usage.limit_reached":
        logger.info("sajn usage limit reached")
    elif event_type == "webhook.test":
        logger.info("Test event received for webhook %s", obj.get("id"))

    else:
        # sajn adds event types without a new API version: acknowledge, don't fail.
        logger.info("Unhandled sajn event type: %s", event_type)


@app.post("/webhooks/sajn")
async def sajn_webhook(request: Request, event: Dict[str, Any] = Depends(verified_sajn_event)):
    # Retries reuse the same event id; acknowledge duplicates with 200.
    event_id = event.get("id") or request.headers.get("webhook-id") or request.headers.get("svix-id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # sajn needs a 2xx within 30 seconds. In production, enqueue the event
        # here and process it asynchronously. Deliveries are unordered: compare
        # event["createdAt"] before overwriting newer data.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling sajn event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
