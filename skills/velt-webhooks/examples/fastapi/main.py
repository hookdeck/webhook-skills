# Generated with: velt-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Velt webhook receiver for FastAPI.

Velt Advanced (V2) webhooks (Enterprise, delivered through Svix) are signed with
Standard Webhooks:
  webhook-id         message id, the same on every retry of a delivery
  webhook-timestamp  Unix seconds when this attempt was signed
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Each webhook endpoint has its own signing secret. Basic (V1) webhooks are not
signed (they send `Authorization: Basic <token>`), so they fail this check.
Hookdeck's Velt source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("velt-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Velt Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The webhook-id header is the message id: the same on every retry of a delivery.
processed_message_ids: set = set()


COMMENT_EVENTS = {
    # Comment threads (annotations)
    "comment_annotation.add",
    "comment_annotation.assign",
    "comment_annotation.status_change",
    "comment_annotation.priority_change",
    "comment_annotation.custom_list_change",
    "comment_annotation.subscribe",
    "comment_annotation.unsubscribe",
    "comment_annotation.accept",
    "comment_annotation.reject",
    "comment_annotation.approve",
    "comment_annotation.suggestion_accept",
    "comment_annotation.suggestion_reject",
    # Comments (messages)
    "comment.add",
    "comment.update",
    "comment.delete",
    "comment.reaction_add",
    "comment.reaction_delete",
}
HUDDLE_EVENTS = {"huddle.create", "huddle.join"}
WORKFLOW_EVENTS = {
    "execution.dispatched",
    "execution.completed",
    "execution.failed",
    "execution.cancelled",
    "step.awaiting-approval",
    "step.completed",
    "step.failed",
    "step.breached",
    "step.cancelled",
    "group.quorum-met",
    "loop.iteration-started",
    "loop.exhausted",
}


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


def verify_velt_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Velt delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_velt_event(request: Request) -> Tuple[str, Dict[str, Any]]:
    """FastAPI dependency: returns (webhook-id, verified Velt event) or raises."""
    secret = os.environ.get("VELT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("VELT_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return headers["webhook-id"], verify_velt_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Velt webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(payload: Dict[str, Any]) -> None:
    # Body: {actionType, data, event, platform, source, webhookId}. `event` is the
    # event type; `data` holds actionUser, the feature object and metadata.
    event = payload.get("event")
    data = payload.get("data") or {}
    doc = ((data.get("metadata") or {}).get("document") or {}).get("documentId") or "unknown document"
    annotation = (data.get("commentAnnotation") or {}).get("annotationId") or "unknown annotation"

    if event in COMMENT_EVENTS:
        # Includes Moderator Mode events and the opt-in suggestion_accept / suggestion_reject.
        logger.info("%s: %s in %s", event, annotation, doc)
    elif event in HUDDLE_EVENTS:
        logger.info("%s: %s", event, doc)
    elif event == "crdt.update_data":
        # Debounced by 5 seconds: one event can cover several edits.
        logger.info("CRDT data updated: %s in %s", (data.get("crdtData") or {}).get("id") or "unknown", doc)
    elif event == "recorder.done":
        logger.info("Recording finished in %s", doc)
    elif event in WORKFLOW_EVENTS:
        logger.info("Review workflow event: %s", event)
    else:
        # Encoded (Base64) or encrypted payloads have no top-level `event`; decode or
        # decrypt them first. Unknown types: the documented list may grow, so acknowledge.
        logger.info("Unhandled Velt event type: %s", event)


@app.post("/webhooks/velt")
async def velt_webhook(verified: Tuple[str, Dict[str, Any]] = Depends(verified_velt_event)):
    message_id, event = verified
    # Delivery is at-least-once; acknowledge duplicates with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Velt expects a 2xx within 15 seconds. In production, enqueue the event
        # here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Velt event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
