# Generated with: act-on-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Act-On webhook receiver for FastAPI.

Act-On delivers outgoing webhooks through an embedded Svix portal. Act-On's
pages don't name the headers, but they are the Svix defaults:
  svix-id         message ID, the same on every retry
  svix-timestamp  Unix seconds of this delivery attempt
  svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the Signing Secret (after its `whsec_` prefix, if any).
The svix-* names are inferred, so the same values sent as webhook-id /
webhook-timestamp / webhook-signature (Svix's other prefix) are accepted too.
"""

import json
import logging
import os
from typing import Any, Dict, List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("act-on-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Act-On Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Act-On's body has no event ID, so dedupe on svix-id (same on every retry).
processed_message_ids: set = set()


def verify_act_on_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Any:
    """Verify an Act-On delivery with the Svix library.

    Svix checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,` entry.
    `verify()` returns None (it raises on failure), so the JSON is parsed here
    afterwards.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


def classify_payload(p: Any) -> List[str]:
    """Infer the event type from the payload's shape.

    Act-On payloads are each event's own object with NO event-type field.
    Returns the candidate event types: one entry when the shape is unique,
    several when Act-On sends identical shapes for different events (subscribe
    a separate endpoint per event, or per group, to tell those apart).
    """
    if not isinstance(p, dict):
        return []
    if "formId" in p and "formName" in p:
        return ["form.submitted"]
    if "startedTime" in p:
        return ["automated-program.started"]
    if "stoppedTime" in p:
        return ["automated-program.stopped"]
    if "leadScore" in p and "scoresheetId" in p:
        return ["contact-lead-score.upper-threshold-surpassed"]
    if "scheduledTimestamp" in p:
        return ["email-message.scheduled"]
    if "categoryChecked" in p:
        return ["subscription-category.opt-in" if p["categoryChecked"] else "subscription-category.opt-out"]
    if "hasOptedOut" in p:
        return ["contact-opt.global-opt-out" if p["hasOptedOut"] else "contact-opt.global-opt-in"]
    if "recId" in p and "srcId" in p:
        return ["contact-email.marked-as-spam"]
    if "isHardBounce" in p:
        return ["contact-bounce.hard" if ("msgId" in p or "categoryReason" in p) else "contact-bounce.soft"]
    if "crmDisplayName" in p:
        return ["crm.connected", "crm.disconnected"]
    if "contact" in p and "contactReportLink" in p:
        return ["contact.added", "contact.updated"]
    if "checked" in p and "id" in p and "name" in p:
        return ["subscription-category.added", "subscription-category.deleted", "subscription-category.updated"]
    return []


async def verified_act_on_payload(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified payload (plus svix-id) or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("ACT_ON_WEBHOOK_SECRET")
    if not secret:
        logger.error("ACT_ON_WEBHOOK_SECRET is not set - rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Fall back to the webhook-* prefix when the svix-* headers are absent.
    headers = {
        "svix-id": request.headers.get("svix-id") or request.headers.get("webhook-id"),
        "svix-timestamp": request.headers.get("svix-timestamp") or request.headers.get("webhook-timestamp"),
        "svix-signature": request.headers.get("svix-signature") or request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: the signature covers the exact bytes, so never verify request.json().
    raw_body = await request.body()
    try:
        payload = verify_act_on_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("Act-On webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")
    return {"message_id": headers["svix-id"], "payload": payload}


def handle_event(payload: Any) -> None:
    candidates = classify_payload(payload)
    key = "|".join(candidates)

    if key == "contact.added|contact.updated":
        # Same shape for both events. Use one endpoint per event type to tell them apart.
        logger.info("Contact added or updated: %s (%s)", payload["email"], payload["contactReportLink"])
    elif key == "contact-bounce.hard":
        logger.info("Hard bounce: %s (%s) for message %s", payload["email"], payload.get("categoryReason"), payload.get("msgId"))
    elif key == "contact-bounce.soft":
        logger.info("Soft bounce: %s", payload["email"])
    elif key == "contact-email.marked-as-spam":
        logger.info("Spam complaint: %s on message %s", payload["email"], payload["msgId"])
    elif key == "contact-opt.global-opt-out":
        logger.info("Global opt-out: %s", payload["email"])
    elif key == "contact-opt.global-opt-in":
        logger.info("Global opt-in: %s", payload["email"])
    elif key == "contact-lead-score.upper-threshold-surpassed":
        logger.info("Lead score %s passed the threshold on %s: %s", payload["leadScore"], payload["scoresheetId"], payload["email"])
    elif key == "form.submitted":
        logger.info("Form submitted: %s (%s) by %s", payload["formName"], payload["formId"], (payload.get("contact") or {}).get("email"))
    elif key == "automated-program.started":
        logger.info("Automated Program started: %s", payload["name"])
    elif key == "automated-program.stopped":
        logger.info("Automated Program stopped: %s", payload["name"])
    elif key in ("subscription-category.opt-in", "subscription-category.opt-out"):
        logger.info("%s: %s -> %s", candidates[0], payload["email"], payload["categoryName"])
    elif key == "subscription-category.added|subscription-category.deleted|subscription-category.updated":
        logger.info("Subscription category changed: %s (checked=%s)", payload["name"], payload["checked"])
    elif key == "crm.connected|crm.disconnected":
        logger.info("CRM connection event: %s (%s)", payload["crmDisplayName"], payload.get("detail"))
    elif key == "email-message.scheduled":
        logger.info('Email scheduled: "%s" to %s recipients', payload.get("title"), payload.get("numTargetedRecipients"))
    else:
        logger.info("Unrecognised Act-On payload shape: %s", list(payload) if isinstance(payload, dict) else type(payload).__name__)


# Act-On only sends POST.
@app.post("/webhooks/act-on")
async def act_on_webhook(verified: Dict[str, Any] = Depends(verified_act_on_payload)):
    message_id = verified["message_id"]

    # Duplicates are normal (at-least-once delivery) - acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the payload here and process it asynchronously.
        handle_event(verified["payload"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Act-On event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
