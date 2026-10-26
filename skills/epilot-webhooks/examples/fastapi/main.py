# Generated with: epilot-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""epilot webhook receiver for FastAPI.

epilot signs webhooks per Standard Webhooks:
  webhook-id         unique message ID (stable across retries)
  webhook-timestamp  Unix seconds when the request was signed
  webhook-signature  space-separated entries: "v1a,<Ed25519> v1,<HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the webhook's secret after its `whsec_` prefix.
The v1a (Ed25519) entry is ignored here; the v1 entry proves the request was
made for your webhook. Each webhook config has its own secret.
"""

import json
import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("epilot-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="epilot Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# webhook-id is stable across retries of the same message.
processed_message_ids: set = set()


def resolve_signature_headers(headers: Mapping[str, str]) -> Optional[Dict[str, str]]:
    """Read the three signature headers.

    epilot sends webhook-*; when webhook-id is absent, fall back to the svix-*
    names (as Hookdeck does). The result uses the webhook-* names the
    standardwebhooks library expects. Returns None when any header is missing.
    """
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


def verify_epilot_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an epilot delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.
    Other versions, such as epilot's `v1a` Ed25519 entry, are skipped. Raises
    on failure (WebhookVerificationError, or ValueError for a malformed entry).
    """
    Webhook(secret).verify(raw_body, headers, json_parse=False)
    # A bodiless (e.g. GET) delivery is verified over zero bytes.
    return json.loads(raw_body) if raw_body else {}


async def verified_epilot_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified epilot payload or raises."""
    secret = os.environ.get("EPILOT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("EPILOT_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_epilot_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, non-JSON body
        logger.error("epilot webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.message_id = headers["webhook-id"]
    return event


def event_name(event: Dict[str, Any]) -> Optional[str]:
    """The event name is per organization. The default payload carries it in
    metadata.event_type; Event Catalog payloads (file events) use _event_name.
    metadata.webhook_id identifies the webhook config, i.e. one eventName."""
    return (event.get("metadata") or {}).get("event_type") or event.get("_event_name")


def handle_event(event: Dict[str, Any]) -> None:
    name = event_name(event)
    metadata = event.get("metadata") or {}
    entity = event.get("entity") or {}

    if name == "automation_trigger_webhook":
        logger.info(
            "Automation trigger: %s %s (webhook %s)",
            entity.get("_schema_"),
            entity.get("_id"),
            metadata.get("webhook_id"),
        )
    elif name == "customer_request_created":
        logger.info("Customer request created: %s %s", entity.get("_schema_"), entity.get("_id"))
    elif name in ("FileCreated", "event_FileCreated"):
        # Event Catalog envelope; files are listed in event_attachments.
        files = ", ".join(str(f.get("filename")) for f in event.get("event_attachments") or [])
        logger.info("File created in org %s: %s", event.get("_org_id"), files)
    else:
        logger.info("Unhandled epilot event: %s (webhook %s)", name, metadata.get("webhook_id"))


# Each epilot webhook config sets its own httpMethod, so accept all of them.
@app.api_route("/webhooks/epilot", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def epilot_webhook(request: Request, event: Dict[str, Any] = Depends(verified_epilot_event)):
    # Retries reuse the same webhook-id; acknowledge duplicates with 200.
    message_id = request.state.message_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling epilot event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
