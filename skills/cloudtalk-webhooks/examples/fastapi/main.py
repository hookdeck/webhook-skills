# Generated with: cloudtalk-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""CloudTalk webhook receiver for FastAPI.

CloudTalk account-level webhooks (Settings > Webhooks) use the Svix scheme:
  svix-id         delivery id (same on every retry of the event)
  svix-timestamp  Unix seconds when the request was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.

NOT signed this way: the Call Flow Designer Webhook step, an AI Voice Agent's
"Send via Webhook" option, and Workflow Automation actions.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("cloudtalk-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CloudTalk Webhook Handler")

# In-memory dedupe for the demo. Use a store with a unique constraint (Redis
# SET NX, unique index) in production and keep ids for 30 days, because
# Resend and Recover can replay anything within CloudTalk's retention window.
processed_event_ids: set = set()


def verify_cloudtalk_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a CloudTalk delivery with the Svix library.

    Svix checks the timestamp (5-minute tolerance), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.
    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_cloudtalk_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified CloudTalk event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("CLOUDTALK_WEBHOOK_SECRET")
    if not secret:
        logger.error("CLOUDTALK_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: the signature covers the exact bytes, so never verify request.json().
    raw_body = await request.body()
    try:
        return verify_cloudtalk_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("CloudTalk webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # Envelope: event_id, type, version, occurred_at, company_id, data
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Calls -----------------------------------------------------------------
    if event_type == "call.started":
        logger.info("Call started %s (%s) with %s", data.get("call_uuid"), data.get("direction"), data.get("external_number"))
    elif event_type == "call.ringing":
        logger.info("Call ringing %s", data.get("call_uuid"))
    elif event_type == "call.answered":
        logger.info("Call answered %s", data.get("call_uuid"))
    elif event_type in ("call.held", "call.resumed"):
        # Events can arrive out of order: pair on call_uuid and sort by occurred_at.
        logger.info("%s %s by %s", event_type, data.get("call_uuid"), (data.get("user") or {}).get("name"))
    elif event_type == "call.ended":
        logger.info(
            "Call ended %s: %ss total, %ss talking, recorded=%s",
            data.get("call_uuid"), data.get("duration"), data.get("talking_time"), data.get("recorded"),
        )
    elif event_type == "call.recording_ready":
        # Async, can arrive minutes after call.ended.
        logger.info("Recording ready for call %s", data.get("call_uuid"))
    elif event_type == "call.tags_modified":
        logger.info("Tags modified on call %s", data.get("call_uuid"))

    # --- Contacts ----------------------------------------------------------------
    elif event_type in ("contact.created", "contact.updated"):
        logger.info("%s: %s (%s)", event_type, data.get("name"), data.get("id"))
    elif event_type == "contact.deleted":
        # Id only.
        logger.info("Contact deleted: %s", data.get("id"))

    # --- Users ---------------------------------------------------------------------
    elif event_type in ("user.created", "user.updated"):
        logger.info("%s: %s", event_type, data.get("name") or data.get("id"))
    elif event_type == "user.deleted":
        logger.info("User deleted: %s", data.get("id"))
    elif event_type == "user.status_changed":
        logger.info("User %s is now %s (%s)", data.get("user_id"), data.get("status"), data.get("sub_status"))

    # --- Messages (SMS, MMS, WhatsApp) ---------------------------------------------
    elif event_type in ("message.sent", "message.received"):
        logger.info("%s (%s) with %s: %s", event_type, data.get("channel"), data.get("external_number"), data.get("body"))

    # --- Conversation Intelligence -------------------------------------------------
    elif event_type == "transcript.ready":
        logger.info("Transcript ready for call %s", data.get("call_uuid") or data.get("call_id"))
    elif event_type == "cidata.ready":
        logger.info("AI analysis ready for call %s", data.get("call_uuid") or data.get("call_id"))

    # --- AI Voice Agents and Dialer ---------------------------------------------------
    elif event_type == "voice_agent.extracted_data_ready":
        logger.info("Voice agent extracted data ready")
    elif event_type == "dialer.disposition_created":
        logger.info("Dialer disposition recorded")
    elif event_type == "dialer.survey_filled":
        logger.info("Dialer survey filled")

    else:
        # New event types are added over time: acknowledge and ignore.
        logger.info("Unhandled CloudTalk event type: %s", event_type)


@app.post("/webhooks/cloudtalk")
async def cloudtalk_webhook(event: Dict[str, Any] = Depends(verified_cloudtalk_event)):
    event_id = event.get("event_id")

    # Delivery is at-least-once: duplicates carry the same event_id.
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # CloudTalk needs a 2xx within 15 seconds. In production, enqueue the
        # event here and process it asynchronously.
        processed_event_ids.add(event_id)  # claim before doing the work
        handle_event(event)
    except Exception:
        processed_event_ids.discard(event_id)  # release so a retry can process it
        logger.exception("Error handling CloudTalk event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
