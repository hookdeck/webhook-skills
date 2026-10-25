# Generated with: rocketreach-webhooks skill
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

app = FastAPI(title="RocketReach Webhook Handler")


def verify_rocketreach_signature(
    raw_body: bytes, signature_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a RocketReach webhook.

    X-RocketReach-Signature = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
    No timestamp is signed.
    """
    if not signature_header or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500
    return hmac.compare_digest(expected, signature_header.encode("utf-8"))


@app.post("/webhooks/rocketreach")
async def rocketreach_webhook(request: Request):
    secret = os.getenv("ROCKETREACH_WEBHOOK_SECRET")
    if not secret:
        # Fail closed: never process unverified webhooks
        logger.error("ROCKETREACH_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-rocketreach-signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing X-RocketReach-Signature header")

    # Raw bytes, whatever the content type: do not use request.json() before verifying
    raw_body = await request.body()
    if not verify_rocketreach_signature(raw_body, signature, secret):
        logger.error("RocketReach signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # There are no event types. A People Lookup delivers one profile object and a Bulk
    # People Lookup delivers a list of them.
    request_id = request.headers.get("rr-request-id")
    profiles = payload if isinstance(payload, list) else [payload]

    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        profile_list = profile.get("profile_list") or {}
        list_note = f" (list {profile_list.get('id')})" if profile_list else ""
        status = profile.get("status")
        if status == "complete":
            logger.info("Lookup complete for profile %s%s [request %s]", profile.get("id"), list_note, request_id)
        else:
            logger.info("Lookup %s for profile %s%s [request %s]", status or "update", profile.get("id"), list_note, request_id)

    # Key idempotency on the RR-Request-ID header plus the profile id
    # (see references/overview.md).
    return {"received": True, "profiles": len(profiles)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
