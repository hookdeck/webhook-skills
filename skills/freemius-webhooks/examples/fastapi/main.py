# Generated with: freemius-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("freemius-webhooks")

app = FastAPI(title="Freemius Webhooks")

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_freemius_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify Freemius's x-signature: bare hex HMAC-SHA256 of the raw body,
    keyed with the product secret key (UTF-8 bytes, as-is). No prefix, no timestamp."""
    if not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes, not str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected, signature.lower().encode())


def handle_event(event: dict) -> None:
    """Handle a verified event. The delivered payload has the same schema as
    Freemius's API event resource, with the event name in the top-level `type`."""
    event_type = event["type"]
    # Only touch nested fields after checking their type: the body is untrusted input
    event_id = event.get("id")
    if not isinstance(event_id, (str, int)) or isinstance(event_id, bool):
        event_id = "(no id)"
    objects = event.get("objects")
    object_names = ", ".join(objects) if isinstance(objects, dict) else ""

    if event_type in ("license.activated", "license.created"):
        logger.info("License event %s (%s); objects: %s", event_type, event_id, object_names or "none")
        # TODO: Provision or unlock the product for this license
    elif event_type == "license.cancelled":
        logger.info("License cancelled (%s)", event_id)
        # TODO: Revoke access
    elif event_type in ("subscription.created", "subscription.cancelled"):
        logger.info("Subscription event %s (%s)", event_type, event_id)
        # TODO: Sync subscription state
    elif event_type in ("payment.created", "payment.refund"):
        logger.info("Payment event %s (%s)", event_type, event_id)
        # TODO: Record the payment or refund
    elif event_type == "user.created":
        logger.info("New user (%s)", event_id)
        # TODO: Create the customer record
    else:
        # Freemius lists ~150 event types and may add more at any time: log and acknowledge
        logger.info("Unhandled Freemius event type: %s", event_type)


@app.post("/webhooks/freemius")
async def freemius_webhook(request: Request):
    secret = os.environ.get("FREEMIUS_WEBHOOK_SECRET")
    if not secret:
        logger.error("FREEMIUS_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Raw bytes - verification must run on exactly what Freemius sent
    raw_body = await request.body()

    if not verify_freemius_signature(raw_body, request.headers.get("x-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Missing event type")

    try:
        handle_event(event)
    except Exception:
        logger.exception("Error handling Freemius webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
