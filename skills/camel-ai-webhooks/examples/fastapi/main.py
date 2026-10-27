# Generated with: camel-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""camelAI (camelRun) webhook receiver for FastAPI.

camelAI webhooks follow Standard Webhooks:
  webhook-id         the event id (evt_...), stable across retries
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
Hookdeck also accepts the svix-* spelling of the same three headers, so this
handler does too.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("camel-ai-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="camelAI Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Delivery is at least once and the event id is stable across retries.
processed_event_ids: set = set()


def extract_signature_headers(headers: Any) -> Dict[str, str]:
    """Read the three signature headers, preferring webhook-* and falling back
    to svix-* when webhook-id is absent (the same rule Hookdeck applies)."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "id": headers.get(f"{prefix}-id", ""),
        "timestamp": headers.get(f"{prefix}-timestamp", ""),
        "signature": headers.get(f"{prefix}-signature", ""),
    }


def verify_camel_ai_webhook(raw_body: bytes, sig: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a camelAI delivery with the Standard Webhooks library.

    It enforces a fixed 5-minute timestamp window, recomputes the HMAC over the
    raw body, and compares in constant time against every `v1,` entry. The
    library expects webhook-* names, so the values are passed under those names
    whichever prefix the request used. Raises WebhookVerificationError on failure.

    Hookdeck retries and replays resend the original timestamp, so a retry later
    than 5 minutes is rejected here. See references/verification.md for a manual
    verifier without the window.
    """
    return Webhook(secret).verify(
        raw_body,
        {
            "webhook-id": sig["id"],
            "webhook-timestamp": sig["timestamp"],
            "webhook-signature": sig["signature"],
        },
    )


async def verified_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: verify the signature on the raw body, then return the event."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("CAMEL_AI_WEBHOOK_SECRET")
    if not secret:
        logger.error("CAMEL_AI_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    sig = extract_signature_headers(request.headers)
    if not all(sig.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # request.body() is the exact bytes camelAI sent, whatever the Content-Type.
    raw_body = await request.body()
    try:
        event = verify_camel_ai_webhook(raw_body, sig, secret)
    except Exception as exc:  # WebhookVerificationError or a non-JSON body
        logger.error("camelAI webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    # A correctly signed but empty or non-object body is not an event envelope.
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    event.setdefault("id", sig["id"])
    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}  # data fields vary by event type

    # Runs
    if event_type in ("run.started", "run.completed", "run.failed"):
        logger.info("%s: event %s", event_type, event["id"])
    # Human input
    elif event_type in ("input.requested", "input.resolved"):
        logger.info("%s: %s", event_type, json.dumps(data))
    # Usage
    elif event_type == "usage.recorded":
        logger.info("Usage recorded: %s", json.dumps(data))
    # Voice sessions
    elif event_type in (
        "voice.session.started",
        "voice.session.ended",
        "voice.session.error",
        "voice.utterance",
        "voice.speech.started",
        "voice.speech.ended",
    ):
        logger.info("%s: %s", event_type, json.dumps(data))
    # Billing
    elif event_type in ("billing.balance.low", "billing.balance.depleted"):
        logger.info("%s: %s", event_type, json.dumps(data))
    # End-user credits
    elif event_type in (
        "end_user.balance.low",
        "end_user.credit.exhausted",
        "end_user.credit.granted",
        "end_user.credit.refunded",
        "end_user.credit.adjusted",
        "end_user.allowance.low",
    ):
        logger.info("%s: %s", event_type, json.dumps(data))
    else:
        logger.info("Unhandled camelAI event type: %s", event_type)


@app.post("/webhooks/camel-ai")
async def camel_ai_webhook(event: Dict[str, Any] = Depends(verified_event)):
    # Retries reuse the same event id; acknowledge duplicates with 200.
    event_id = event["id"]
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # camelAI needs a 2xx within 10 seconds. In production, enqueue the
        # event here and process it asynchronously. Retries can reorder, so
        # order by event["created"] (Unix seconds), not arrival.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling camelAI event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
