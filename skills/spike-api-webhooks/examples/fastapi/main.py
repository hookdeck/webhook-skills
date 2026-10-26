import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_spike_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """X-Body-Signature is the bare hex HMAC-SHA256 of the raw body, keyed with the
    shared secret (UTF-8 bytes, used as-is). No timestamp is signed."""
    # Validate shape first (exact length and alphabet; a non-ASCII header fails here)
    if not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, never str
    return hmac.compare_digest(expected.encode(), signature.lower().encode())


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/spike-api")
async def spike_api_webhook(request: Request):
    secret = os.getenv("SPIKE_API_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="SPIKE_API_WEBHOOK_SECRET not configured")

    signature = request.headers.get("x-body-signature")

    # Verify against the RAW body, never a re-serialized version
    raw_body = await request.body()
    if not signature or not verify_spike_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        events = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is a JSON ARRAY; one delivery can batch several events
    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="Expected a JSON array of events")

    for event in events:
        # Everything after verification is still untrusted input: check types
        if not isinstance(event, dict):
            continue
        event_type = event.get("event_type")
        user = event.get("application_user_id")
        user = user if isinstance(user, str) else "unknown"
        provider = event.get("provider_slug")
        provider = provider if isinstance(provider, str) else "unknown"

        if event_type == "record_change":
            metrics = event.get("metrics")
            metrics = [m for m in metrics if isinstance(m, str)] if isinstance(metrics, list) else []
            logger.info("New data from %s for %s: %s", provider, user, ", ".join(metrics) or "no metrics")
            # Fetch the changed records from the Spike API between
            # earliest_record_start_at and latest_record_end_at
        elif event_type == "provider_integration_created":
            logger.info("%s connected %s", user, provider)
        elif event_type == "provider_integration_deleted":
            logger.info("%s disconnected %s", user, provider)
        else:
            logger.info("Unhandled event type: %s", event_type)

    # Spike API retries anything other than exactly HTTP 200
    return {"received": True}
