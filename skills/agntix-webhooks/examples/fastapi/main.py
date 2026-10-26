# Generated with: agntix-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Agntix webhook receiver for FastAPI.

Agntix delivers webhooks through Svix:
  svix-id         message ID
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

logger = logging.getLogger("agntix-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Agntix Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The top-level `id` is the SESSION UUID and is shared by session.created and
# session.ended, so the key combines eventType and id.
processed_events: set = set()


def verify_agntix_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Agntix delivery with the official Svix library.

    Svix checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,` entry.

    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards.

    Hookdeck retries and replays resend the ORIGINAL timestamp, so this library
    check rejects deliveries retried after 5 minutes. To drop or widen the
    window, use the manual verifier in references/verification.md.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_agntix_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Agntix event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("AGNTIX_WEBHOOK_SECRET")
    if not secret:
        logger.error("AGNTIX_WEBHOOK_SECRET is not set — rejecting delivery")
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
        return verify_agntix_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("Agntix webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # Flat envelope (no `data`). `eventType` is the event; `type` is VOICE | CHAT.
    event_type = event.get("eventType")

    if event_type == "session.created":
        # Fires when the session is initiated (for outbound calls: before pickup).
        variables = (event.get("metadata") or {}).get("sessionVariables") or {}
        logger.info(
            "Session created: %s (%s/%s/%s) agent %s, variables %s",
            event.get("id"), event.get("type"), event.get("platform"), event.get("direction"),
            event.get("agentId"), json.dumps(variables),
        )
    elif event_type == "session.ended":
        # Fires once when the session closes, with the post-call analysis attached.
        analysis = event.get("analysis") or {}
        logger.info(
            "Session ended: %s at %s. Summary: %s. Recording: %s",
            event.get("id"), event.get("endedAt"),
            analysis.get("summary", "n/a"), event.get("recordingUrl", "n/a"),
        )
    else:
        logger.info("Unhandled Agntix event type: %s", event_type)


@app.post("/webhooks/agntix")
async def agntix_webhook(event: Dict[str, Any] = Depends(verified_agntix_event)):
    dedupe_key = f"{event.get('eventType')}:{event.get('id')}"

    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    if dedupe_key in processed_events:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Agntix needs a 2xx within 15 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_events.add(dedupe_key)
    except Exception:
        logger.exception("Error handling Agntix event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
