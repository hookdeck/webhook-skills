# Generated with: sendoso-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("sendoso_webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# ---------------------------------------------------------------------------
# Sendoso delivers webhooks through Svix:
#   svix-id         unique message id (stable across retries -> dedupe key)
#   svix-timestamp  Unix seconds of the delivery attempt
#   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
# Signed content: f"{svix-id}.{svix-timestamp}.{raw body}"
# Key: base64-decode of the endpoint secret after its "whsec_" prefix.
# ---------------------------------------------------------------------------

# In-memory state for the demo. Use Redis or your database in production.
processed_message_ids: set[str] = set()  # svix-id values already handled
last_status_change_by_send: dict[str, str] = {}  # send_gid -> status_changed_at


def _parse_iso(value: str) -> datetime:
    # Python < 3.11 doesn't accept a trailing "Z" in fromisoformat()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def verified_sendoso_payload(request: Request) -> tuple[str, dict]:
    """FastAPI dependency: verify the Svix signature and return (svix-id, payload)."""
    secret = os.environ.get("SENDOSO_WEBHOOK_SECRET")
    if not secret:
        # Fail closed: never accept unverified deliveries because a secret is missing.
        logger.error("SENDOSO_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(
            status_code=400, detail="Missing svix-id, svix-timestamp or svix-signature header"
        )

    # Raw bytes: a Pydantic body model or request.json() would break the signature.
    raw_body = await request.body()

    try:
        # Official Svix SDK: ±5 minute timestamp window, every v1 entry,
        # constant-time compare. Returns None in svix 2.x; raises on failure
        # (WebhookVerificationError, or other errors for malformed headers).
        Webhook(secret).verify(raw_body, headers)
    except Exception as err:
        logger.error("Sendoso webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if not (
        isinstance(payload, dict)
        and isinstance(payload.get("send_gid"), str)
        and isinstance(payload.get("status_changed_at"), str)
    ):
        raise HTTPException(
            status_code=400, detail="Payload missing send_gid or status_changed_at"
        )

    return headers["svix-id"], payload


def handle_send_status_change(payload: dict) -> bool:
    """Process one status change. Returns False if the update was stale.

    Every Sendoso event type (send.shipped, send.delivered, send.redeemed, ...)
    shares one documented payload: {send_gid, status_changed_at}. The event
    type isn't in the documented body, so either subscribe this endpoint only
    to the events it should act on, or look the send up by send_gid
    (Retrieve All Sends) to read its current status.
    """
    send_gid = payload["send_gid"]
    status_changed_at = payload["status_changed_at"]

    previous = last_status_change_by_send.get(send_gid)
    if previous and _parse_iso(previous) >= _parse_iso(status_changed_at):
        # Retries and replays can arrive out of order; ignore stale updates.
        logger.info("Ignoring stale update for send %s (%s)", send_gid, status_changed_at)
        return False
    last_status_change_by_send[send_gid] = status_changed_at

    # e.g. enqueue a job that fetches the send and updates your CRM.
    logger.info("Sendoso send %s changed status at %s", send_gid, status_changed_at)
    return True


@app.post("/webhooks/sendoso")
async def sendoso_webhook(verified: tuple[str, dict] = Depends(verified_sendoso_payload)):
    message_id, payload = verified

    # At-least-once delivery: acknowledge duplicates without reprocessing.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Sendoso times out after 15 seconds; in production enqueue and return.
        fresh = handle_send_status_change(payload)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status_changed_at")
    except Exception:
        logger.exception("Error handling Sendoso webhook")
        raise HTTPException(status_code=500, detail="Internal server error")

    processed_message_ids.add(message_id)
    return {"received": True} if fresh else {"received": True, "stale": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
