# Generated with: outhire-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Outhire webhook receiver for FastAPI.

Outhire signs deliveries with Standard Webhooks:
  webhook-id         unique delivery ID
  webhook-timestamp  Unix seconds when the request was sent
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
Hookdeck also accepts the svix-* spelling of the same three headers, so this
handler falls back to svix-id / svix-timestamp / svix-signature when webhook-id
is absent.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("outhire-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Outhire Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The body has no event ID, so dedupe on the webhook-id header.
processed_delivery_ids: set = set()


def signature_headers(headers: Any) -> Optional[Dict[str, str]]:
    """Read the three signature headers, preferring webhook-* and falling back
    to svix-* when webhook-id is missing. Returns the values under the names the
    standardwebhooks library expects, or None if any is missing."""
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


def verify_outhire_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Outhire delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.

    Hookdeck retries and replays resend the original timestamp, so this rejects a
    retry that arrives more than 5 minutes late. See references/verification.md
    for a manual verifier without that window.

    Returns the parsed event; raises on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_outhire_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Outhire event or raises."""
    secret = os.environ.get("OUTHIRE_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("OUTHIRE_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_outhire_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Outhire webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.delivery_id = headers["webhook-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event")
    candidate = event.get("candidate") or {}
    job = event.get("job") or {}

    if event_type == "candidate.applied":
        logger.info(
            "Candidate %s (%s) applied to job %s %r, fit score %s",
            candidate.get("id"),
            candidate.get("name"),
            job.get("id"),
            job.get("title"),
            candidate.get("fit_score") if candidate.get("fit_score") is not None else "pending",
        )
    elif event_type == "candidate.stage_changed":
        change = event.get("stage_change") or {}
        # changed_by is one of: user, joel, api
        logger.info(
            "Candidate %s moved %s -> %s (by %s)",
            candidate.get("id"),
            change.get("previous_stage"),
            change.get("new_stage"),
            change.get("changed_by"),
        )
    elif event_type == "webhook.ping":
        # Sent by "Send test ping"; a signed delivery, not a challenge.
        logger.info("Test ping for webhook %s", (event.get("webhook") or {}).get("id"))
    else:
        logger.info("Unhandled Outhire event: %s", event_type)


@app.post("/webhooks/outhire")
async def outhire_webhook(request: Request, event: Dict[str, Any] = Depends(verified_outhire_event)):
    # Outhire does not resend a delivered event, but dedupe anyway.
    delivery_id = request.state.delivery_id
    if delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        # Outhire needs a 2xx within 10 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        processed_delivery_ids.add(delivery_id)
    except Exception:
        logger.exception("Error handling Outhire event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
