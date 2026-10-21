# Generated with: ada-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Ada (ada.cx) webhook receiver for FastAPI.

Ada delivers webhooks through Svix:
  svix-id         unique message ID (stable across retries)
  svix-timestamp  Unix seconds when the attempt was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Each Ada webhook endpoint has its own signing secret.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("ada-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Ada Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Ada payloads carry no top-level event ID, so dedupe on the svix-id header.
processed_message_ids: set = set()


def verify_ada_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Ada delivery with the Standard Webhooks library.

    The library is maintained by Svix and uses the same algorithm as the
    `svix` SDK. It checks the timestamp (5-minute tolerance), recomputes the
    HMAC over the raw body, and compares in constant time against every `v1,`
    entry. It expects webhook-* header names, so the svix-* headers Ada sends
    are mapped across. Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(
        raw_body,
        {
            "webhook-id": headers["svix-id"],
            "webhook-timestamp": headers["svix-timestamp"],
            "webhook-signature": headers["svix-signature"],
        },
    )


async def verified_ada_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Ada event or raises."""
    secret = os.environ.get("ADA_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("ADA_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_ada_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Ada webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.svix_id = headers["svix-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Conversations -------------------------------------------------------
    if event_type == "v1.conversation.created":
        logger.info(
            "Conversation created: %s (end user %s)",
            data.get("conversation_id"),
            data.get("end_user_id"),
        )
    elif event_type == "v1.conversation.message":
        # author.role is end_user, ai_agent or human_agent; content.type is
        # text, link, file or quick_replies.
        logger.info(
            "Message %s in %s from %s: %s",
            data.get("message_id"),
            data.get("conversation_id"),
            (data.get("author") or {}).get("role"),
            (data.get("content") or {}).get("type"),
        )
    elif event_type == "v1.conversation.ended":
        logger.info(
            "Conversation ended: %s (by %s)",
            data.get("conversation_id"),
            (data.get("ended_by") or {}).get("role"),
        )
    elif event_type == "v1.conversation.handoff.ended":
        logger.info(
            "Handoff to %s ended in %s",
            data.get("handoff_integration"),
            data.get("conversation_id"),
        )

    # --- End users -----------------------------------------------------------
    elif event_type in ("v1.end_user.created", "v1.end_user.updated"):
        logger.info("%s: %s", event_type, data.get("end_user_id"))

    # --- Audit log (best effort; reconcile with the Audit log pull API) ------
    elif event_type == "v1.audit_log.emitted":
        logger.info(
            "Audit log: %s %s %s",
            data.get("entity_type"),
            data.get("entity_id"),
            data.get("activity"),
        )

    # --- Voice Proactive Outreach (can arrive out of order) ------------------
    elif event_type in (
        "v1.proactive_call.queued",
        "v1.proactive_call.initiated",
        "v1.proactive_call.answered",
        "v1.proactive_call.machine_detected",
    ):
        logger.info("Proactive call %s -> %s", data.get("proactive_attempt_id"), data.get("state"))
    elif event_type == "v1.proactive_call.failed":
        logger.info(
            "Proactive call %s failed: %s",
            data.get("proactive_attempt_id"),
            data.get("failure_reason"),
        )

    else:
        logger.info("Unhandled Ada event type: %s", event_type)


@app.post("/webhooks/ada")
async def ada_webhook(request: Request, event: Dict[str, Any] = Depends(verified_ada_event)):
    # Retries reuse the same svix-id; acknowledge duplicates with 200.
    message_id = request.state.svix_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Ada needs a 2xx within 15 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Ada event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
