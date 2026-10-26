# Generated with: general-translation-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""General Translation webhook receiver for FastAPI.

General Translation signs webhooks with Standard Webhooks:
  webhook-id         event ID (evt_...), stable across retries
  webhook-timestamp  Unix seconds when the attempt was sent
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("general-translation-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="General Translation Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# event["id"] (evt_...) equals the webhook-id header and is stable across retries.
processed_event_ids: set = set()


def resolve_signature_headers(request_headers: Mapping[str, str]) -> Optional[Dict[str, str]]:
    """Read the signature headers.

    General Translation sends webhook-*; when webhook-id is absent, fall back
    to the svix-* names (as Hookdeck does). Returns the three values under the
    names the library expects, or None when one is missing.
    """
    prefix = "webhook" if request_headers.get("webhook-id") else "svix"
    headers = {
        "webhook-id": request_headers.get(f"{prefix}-id"),
        "webhook-timestamp": request_headers.get(f"{prefix}-timestamp"),
        "webhook-signature": request_headers.get(f"{prefix}-signature"),
    }
    return headers if all(headers.values()) else None


def verify_general_translation_webhook(
    raw_body: bytes, headers: Dict[str, str], secret: str
) -> Dict[str, Any]:
    """Verify a delivery with the Standard Webhooks library.

    It enforces a fixed 5-minute timestamp window, recomputes the HMAC over
    the raw body and compares in constant time against every `v1,` entry
    (other versions are ignored). Hookdeck retries and replays resend the
    ORIGINAL timestamp, so late retries fail here; see
    references/verification.md for a manual verifier with a configurable
    window. Returns the parsed event.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_event(request: Request) -> Dict[str, Any]:
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("GENERAL_TRANSLATION_WEBHOOK_SECRET")
    if not secret:
        logger.error("GENERAL_TRANSLATION_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_general_translation_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("General Translation webhook verification failed: %s", err)
        raise HTTPException(status_code=401, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    # data.object.object is the resource kind (translated_file or
    # translation_job), not the event type.
    resource = (event.get("data") or {}).get("object") or {}

    if event_type == "translated_file.completed":
        logger.info(
            "Translated file %s ready (%s, %s)",
            resource.get("id"),
            resource.get("locale"),
            resource.get("fileFormat"),
        )
    elif event_type == "translated_file.edited":
        logger.info("Translated file %s edited at %s", resource.get("id"), resource.get("editedAt"))
    elif event_type == "translation_job.completed":
        logger.info(
            "Translation job %s completed at %s", resource.get("jobId"), resource.get("completedAt")
        )
    else:
        logger.info("Unhandled General Translation event type: %s", event_type)


@app.post("/webhooks/general-translation")
async def general_translation_webhook(event: Dict[str, Any] = Depends(verified_event)):
    # Deliveries are at-least-once; acknowledge duplicates with 200.
    event_id = event.get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Respond with a 2xx within 10 seconds. In production, enqueue the
        # event here and process it asynchronously.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling General Translation event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
