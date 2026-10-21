# Generated with: agentmail-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""AgentMail webhook receiver for FastAPI.

AgentMail delivers webhooks through Svix:
  svix-id         message ID (differs per org/pod/inbox webhook)
  svix-timestamp  Unix seconds when the message was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("agentmail-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AgentMail Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Dedupe on event_id, NOT svix-id: event_id is the same across retries and
# across every webhook (org, pod, inbox) that receives the event.
processed_event_ids: set = set()


def verify_agentmail_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an AgentMail delivery with the official Svix library.

    Svix checks the timestamp (5-minute tolerance), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.

    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards. AgentMail's docs show `msg = wh.verify(...)`, which
    only works with svix 1.x.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_agentmail_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified AgentMail event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("AGENTMAIL_WEBHOOK_SECRET")
    if not secret:
        logger.error("AGENTMAIL_WEBHOOK_SECRET is not set — rejecting delivery")
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
        return verify_agentmail_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("AgentMail webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("event_type")

    # --- Inbound mail ---------------------------------------------------------
    if event_type == "message.received":
        # The only events that carry message content (plus thread metadata).
        # `text` may be missing for HTML-only emails; prefer `html`.
        message, thread = event["message"], event["thread"]
        logger.info(
            'Email received in %s from %s: "%s" (thread %s, %s messages)',
            message["inbox_id"], message["from"], message["subject"],
            thread["thread_id"], thread["message_count"],
        )
    elif event_type in (
        "message.received.spam",
        "message.received.blocked",
        "message.received.unauthenticated",
    ):
        # Opt-in only; same shape as message.received.
        logger.info("%s: %s from %s", event_type, event["message"]["message_id"], event["message"]["from"])

    # --- Outbound mail --------------------------------------------------------
    elif event_type == "message.sent":
        send = event["send"]
        logger.info("Message sent: %s to %s", send["message_id"], ", ".join(send["recipients"]))
    elif event_type == "message.delivered":
        logger.info("Message delivered: %s", event["delivery"]["message_id"])
    elif event_type == "message.bounced":
        bounce = event["bounce"]
        addresses = ", ".join(r["address"] for r in bounce["recipients"])
        logger.info(
            "Message bounced (%s/%s): %s -> %s",
            bounce["type"], bounce["sub_type"], bounce["message_id"], addresses,
        )
    elif event_type == "message.complained":
        complaint = event["complaint"]
        logger.info("Spam complaint on %s: %s", complaint["message_id"], ", ".join(complaint["recipients"]))
    elif event_type == "message.rejected":
        logger.info("Message rejected: %s (%s)", event["reject"]["message_id"], event["reject"]["reason"])
    elif event_type == "message.opened":
        logger.info("Message opened: %s at %s", event["open"]["message_id"], event["open"]["timestamp"])

    # --- Agent Armor ------------------------------------------------------------
    elif event_type == "message.security.completed":
        message = event["message"]
        logger.info("Agent Armor verdict for %s: %s", message["message_id"], message["agent_armor"]["verdict"])
    elif event_type == "message.security.review":
        logger.info("Agent Armor held %s for review", event["message"]["message_id"])
    elif event_type == "message.security.override":
        message = event["message"]
        logger.info("Held message released: %s (%s)", message["message_id"], message["manual_override"]["reason"])

    # --- Domains ----------------------------------------------------------------
    elif event_type == "domain.verified":
        logger.info("Domain verified: %s (%s)", event["domain"]["domain_id"], event["domain"]["status"])

    # --- Calendar -----------------------------------------------------------------
    elif event_type in (
        "calendar.event.created",
        "calendar.event.updated",
        "calendar.event.deleted",
        "calendar.event.responded",
        "calendar.event.starting",
        "calendar.event.ending",
    ):
        calendar_event = event.get("calendar_event") or {}
        logger.info("%s: %s", event_type, calendar_event.get("title") or calendar_event.get("event_id"))

    else:
        logger.info("Unhandled AgentMail event type: %s", event_type)


@app.post("/webhooks/agentmail")
async def agentmail_webhook(event: Dict[str, Any] = Depends(verified_agentmail_event)):
    event_id = event.get("event_id")

    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: AgentMail needs a 2xx within 15 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling AgentMail event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
