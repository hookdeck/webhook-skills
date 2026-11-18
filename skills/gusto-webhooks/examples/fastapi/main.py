# Generated with: gusto-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Gusto (Embedded Payroll) webhook receiver for FastAPI.

Gusto signs event payloads with X-Gusto-Signature: the HMAC-SHA256 of the raw
body, keyed with the subscription's verification_token, as a bare hex digest
(Gusto's developer doc and Rails sample; the current guide doesn't name the
encoding).

Setup handshake: after you create a webhook subscription, Gusto POSTs the
verification_token to your URL. You can't verify that request yet, so it's
acknowledged without a signature check and nothing else happens. Call
PUT /v1/webhook_subscriptions/{uuid}/verify with the token, then set
GUSTO_VERIFICATION_TOKEN.
"""

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("gusto-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Gusto Webhook Handler")


def verify_gusto_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    token: Optional[str],
) -> bool:
    """Verify X-Gusto-Signature against the exact bytes Gusto sent."""
    secret = (token or "").strip()
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)


def verification_token_from(raw_body: bytes) -> Optional[str]:
    """The handshake carries verification_token and no event_type. Anything
    with an event_type is an event and must be signed."""
    try:
        body = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return None
    if isinstance(body, dict) and isinstance(body.get("verification_token"), str) and "event_type" not in body:
        return body["verification_token"]
    return None


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Events name the change and the UUIDs; fetch the entity from the API for
    details. One API call can produce several events, in any order."""
    event_type = event.get("event_type")
    if event_type == "company.provisioned":
        logger.info("Company %s connected", event.get("resource_uuid"))
    elif event_type == "payroll.paid":
        logger.info("Payroll %s paid for company %s", event.get("entity_uuid"), event.get("resource_uuid"))
    elif event_type and event_type.startswith(("payroll.", "employee.")):
        logger.info("%s: %s", event_type, event.get("entity_uuid"))
    else:
        logger.info("Unhandled Gusto event: %s", event_type)
    return {"received": True, "event_type": event_type, "uuid": event.get("uuid")}


@app.post("/webhooks/gusto")
async def gusto_webhook(request: Request):
    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    configured = os.environ.get("GUSTO_VERIFICATION_TOKEN", "")

    handshake_token = verification_token_from(raw_body)
    if handshake_token is not None:
        if not configured.strip():
            # One-time setup: you need this value to verify the subscription.
            logger.info(
                "Gusto sent the subscription's verification_token: %s. Call PUT "
                "/v1/webhook_subscriptions/{uuid}/verify with it, then set GUSTO_VERIFICATION_TOKEN.",
                handshake_token,
            )
        else:
            logger.info("Gusto re-sent the verification_token (not logged: it is your signing key)")
        return {"received": True, "verification_token_received": True}

    if not configured.strip():
        logger.error("GUSTO_VERIFICATION_TOKEN is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    if not verify_gusto_signature(raw_body, request.headers.get("x-gusto-signature"), configured):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Answer with a 2xx within 10 seconds, or Gusto retries (up to 16 times over 3 days).
    return handle_event(event)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
