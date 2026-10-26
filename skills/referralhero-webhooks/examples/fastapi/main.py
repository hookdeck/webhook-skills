# Generated with: referralhero-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("referralhero")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ReferralHero Webhook Handler")

# X-ReferralHero-Signature is the bare, padded, standard-base64 HMAC-SHA256 of the raw body:
# 32 bytes -> 44 characters, 43 of [A-Za-z0-9+/] then "=".
SIGNATURE_FORMAT = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_referralhero_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify X-ReferralHero-Signature against the raw request bytes."""
    if not signature or not secret:
        return False
    # Validate the format first (exact length and alphabet), then decode strictly.
    if SIGNATURE_FORMAT.fullmatch(signature) is None:
        return False
    try:
        received = base64.b64decode(signature, validate=True)
    except ValueError:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Compare bytes AND the re-encoded text: a final character with stray low bits decodes
    # to the same bytes, but Hookdeck compares the base64 text exactly, so reject it too.
    return hmac.compare_digest(received, expected) and hmac.compare_digest(
        base64.b64encode(received), signature.encode("ascii")
    )


def handle_event(event: dict) -> None:
    """Dispatch on the body's `response` field."""
    name = event.get("response")
    if name == "new_registration":
        logger.info("New subscriber registered")
    elif name == "subscriber_promoted":
        logger.info("Subscriber promoted")
    elif name in ("subscriber_updated", "subscriber_fields_updated"):
        # The docs' subscriber_updated example sends subscriber_fields_updated.
        logger.info("Subscriber fields updated")
    elif name == "subscriber_deleted":
        logger.info("Subscriber deleted")
    elif name == "reward_unlocked":
        logger.info("Reward unlocked")
    elif name == "reward_sent":
        logger.info("Reward sent")
    else:
        logger.info("Unhandled ReferralHero event: %s", name)


@app.post("/webhooks/referralhero")
async def referralhero_webhook(request: Request):
    secret = os.getenv("REFERRALHERO_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("REFERRALHERO_WEBHOOK_SECRET is not set; rejecting delivery")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the exact bytes. Parse JSON only after the signature check.
    raw_body = await request.body()
    signature = request.headers.get("x-referralhero-signature")

    if not verify_referralhero_signature(raw_body, signature, secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
    except Exception:
        logger.exception("Error handling ReferralHero event")
        return JSONResponse({"error": "Internal server error"}, status_code=500)

    # ReferralHero wants 200 with a blank body; anything else counts as an error.
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
