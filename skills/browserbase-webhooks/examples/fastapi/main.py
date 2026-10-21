# Generated with: browserbase-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Browserbase webhook receiver for FastAPI.

Browserbase signs deliveries with Standard Webhooks:
  webhook-id         unique message identifier
  webhook-timestamp  Unix seconds when the delivery was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.

Browserbase returns the secret only when you create or rotate the webhook.
"""

import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("browserbase-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Browserbase Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# The envelope `id` is stable across retries of the same event.
processed_event_ids: set = set()

INVOCATION_EVENTS = {
    "functions.invocations.pending": "queued",
    "functions.invocations.running": "running",
    "functions.invocations.completed": "completed",
    "functions.invocations.failed": "failed",
}
BUILD_EVENTS = {
    "functions.builds.running": "running",
    "functions.builds.completed": "completed",
    "functions.builds.failed": "failed",
}


def get_secrets() -> List[str]:
    """Secrets to try, current first.

    After a rotation Browserbase keeps the previous secret verifying for 24
    hours, so BROWSERBASE_WEBHOOK_SECRET_PREVIOUS is accepted too.
    """
    candidates = [
        os.environ.get("BROWSERBASE_WEBHOOK_SECRET"),
        os.environ.get("BROWSERBASE_WEBHOOK_SECRET_PREVIOUS"),
    ]
    return [s for s in candidates if s]


def verify_browserbase_webhook(
    raw_body: bytes, headers: Dict[str, str], secrets: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Verify a Browserbase delivery with the official Standard Webhooks SDK.

    The SDK checks the timestamp (5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises if no configured secret verifies the delivery.
    """
    secrets = get_secrets() if secrets is None else secrets
    last_error: Exception = ValueError("No signing secret configured")
    for secret in secrets:
        try:
            return Webhook(secret).verify(raw_body, headers)
        except Exception as err:  # WebhookVerificationError, bad base64, etc.
            last_error = err
    raise last_error


async def verified_browserbase_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Browserbase event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not get_secrets():
        logger.error("BROWSERBASE_WEBHOOK_SECRET is not set, rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_browserbase_webhook(raw_body, headers)
    except Exception as err:
        logger.error("Browserbase webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # Envelope: {id, type, resourceId, data}. Keys are additive, so ignore
    # anything you don't recognize.
    event_type = event.get("type")
    resource_id = event.get("resourceId")

    # --- Function invocations (resourceId = invocation) ----------------------
    # functions.invocations.completed: terminal success, update your record.
    # functions.invocations.failed: terminal failure, alert or retry.
    if event_type in INVOCATION_EVENTS:
        logger.info("Invocation %s %s", resource_id, INVOCATION_EVENTS[event_type])

    # --- Function builds (resourceId = build) --------------------------------
    elif event_type in BUILD_EVENTS:
        logger.info("Build %s %s", resource_id, BUILD_EVENTS[event_type])

    else:
        # Browserbase adds event types over time.
        logger.info("Unhandled Browserbase event type: %s", event_type)


@app.post("/webhooks/browserbase")
async def browserbase_webhook(event: Dict[str, Any] = Depends(verified_browserbase_event)):
    # Redelivery is normal (retries, or a response that arrived too late).
    event_id = event.get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Browserbase needs a 2xx within 15 seconds. In
        # production, store or enqueue the event here and process it afterwards.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Browserbase event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
