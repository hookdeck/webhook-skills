# Generated with: zoho-sign-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Zoho Sign Webhook Handler")


def verify_zoho_sign_signature(
    raw_body: bytes, signature_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Zoho Sign webhook.

    X-ZS-WEBHOOK-SIGNATURE = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
    (Zoho's docs write "HMAC SHA-256(payload+secret_key)", but the secret is the HMAC key
    and is NOT appended to the payload.) No timestamp is signed.
    """
    if not signature_header or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    # compare_digest handles different lengths safely
    return hmac.compare_digest(expected.encode(), signature_header.encode())


@app.post("/webhooks/zoho-sign")
async def zoho_sign_webhook(request: Request):
    secret = os.getenv("ZOHO_SIGN_WEBHOOK_SECRET")
    if not secret:
        # Fail closed: never process unverified webhooks
        logger.error("ZOHO_SIGN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-zs-webhook-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-ZS-WEBHOOK-SIGNATURE header")

    # Raw bytes, whatever the content type: do not use request.json() before verifying
    raw_body = await request.body()
    if not verify_zoho_sign_signature(raw_body, signature, secret):
        logger.error("Zoho Sign signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    notification = payload.get("notifications") or {}
    req = payload.get("requests") or {}
    event_type = notification.get("operation_type")

    if event_type == "RequestSubmitted":
        logger.info("Request submitted: %s (%s)", req.get("request_name"), req.get("request_id"))
    elif event_type == "RequestViewed":
        logger.info("Request viewed by %s", notification.get("performed_by_email"))
    elif event_type == "RequestSigningSuccess":
        logger.info(
            "Signed by %s (action %s)",
            notification.get("performed_by_email"),
            notification.get("action_id"),
        )
    elif event_type == "RequestCompleted":
        logger.info("Request completed: %s (%s)", req.get("request_name"), req.get("request_id"))
    elif event_type == "RequestRejected":
        logger.info("Request rejected: %s", notification.get("reason") or "no reason given")
    elif event_type == "RequestRecalled":
        logger.info("Request recalled: %s", req.get("request_id"))
    elif event_type == "RequestForwarded":
        logger.info("Request forwarded by %s", notification.get("performed_by_email"))
    elif event_type == "RequestExpired":
        logger.info("Request expired: %s", req.get("request_id"))
    else:
        logger.info("Unhandled event type: %s", event_type)

    # There is no event ID, so key idempotency on request, event, action and time
    # (see references/overview.md).
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
