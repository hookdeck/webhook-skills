# Generated with: folk-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""folk (CRM) webhook receiver for FastAPI.

folk webhooks follow the Standard Webhooks spec:
  webhook-id         unique event ID (same as the payload's `id`)
  webhook-timestamp  Unix seconds of the delivery
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the signing secret after its `whsec_` prefix.
The secret is shown only once, when the webhook is created.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("folk-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="folk Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# folk can deliver an event more than once; webhook-id (= event id) is stable.
processed_event_ids: set = set()


def verify_folk_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a folk delivery with the official Standard Webhooks library.

    It checks the timestamp (fixed 5-minute window), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.

    Replays and Hookdeck retries resend the ORIGINAL timestamp, so this rejects
    them after 5 minutes. See references/verification.md for a manual verifier
    where the window can be dropped or widened.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_folk_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified folk event or raises."""
    secret = os.environ.get("FOLK_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("FOLK_WEBHOOK_SECRET is not set; rejecting delivery")
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
        event = verify_folk_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("folk webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.webhook_id = headers["webhook-id"]
    return event


# Payloads are thin: data.id and data.url identify the resource (GET data.url
# for the full record). Updates carry data.changes, deletions carry data.details.
def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}
    resource_id = data.get("id")
    details = data.get("details") or {}
    changes = len(data.get("changes") or [])

    # --- People --------------------------------------------------------------
    if event_type == "person.created":
        logger.info("Person created: %s", resource_id)
    elif event_type == "person.updated":
        logger.info("Person updated: %s (%d changes)", resource_id, changes)
    elif event_type == "person.deleted":
        logger.info("Person deleted: %s (%s)", resource_id, details.get("name"))
    elif event_type == "person.groups_updated":
        logger.info("Person groups updated: %s", resource_id)
    elif event_type == "person.workspace_interaction_metadata_updated":
        logger.info("Person interaction metadata updated: %s", resource_id)

    # --- Companies -----------------------------------------------------------
    elif event_type == "company.created":
        logger.info("Company created: %s", resource_id)
    elif event_type == "company.updated":
        logger.info("Company updated: %s (%d changes)", resource_id, changes)
    elif event_type == "company.deleted":
        logger.info("Company deleted: %s (%s)", resource_id, details.get("name"))
    elif event_type == "company.groups_updated":
        logger.info("Company groups updated: %s", resource_id)

    # --- Custom objects (e.g. deals) -----------------------------------------
    elif event_type == "object.created":
        logger.info("Object created: %s", resource_id)
    elif event_type == "object.updated":
        logger.info("Object updated: %s (%d changes)", resource_id, changes)
    elif event_type == "object.deleted":
        logger.info("Object deleted: %s (%s)", resource_id, details.get("name"))

    # --- Notes and reminders -------------------------------------------------
    elif event_type in (
        "note.created",
        "note.updated",
        "note.deleted",
        "reminder.created",
        "reminder.updated",
        "reminder.deleted",
        "reminder.triggered",
    ):
        logger.info("%s: %s", event_type, resource_id)

    # --- Person enrichments --------------------------------------------------
    elif event_type == "person_enrichment.finished":
        logger.info("Enrichment %s finished", resource_id)

    else:
        logger.info("Unhandled folk event type: %s", event_type)


@app.post("/webhooks/folk")
async def folk_webhook(request: Request, event: Dict[str, Any] = Depends(verified_folk_event)):
    # Redeliveries reuse the same webhook-id; acknowledge duplicates with 200.
    event_id = request.state.webhook_id
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Return a 2xx quickly. In production, enqueue the event here and
        # process it asynchronously (a 410 would deactivate the webhook, so
        # never send one).
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling folk event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
