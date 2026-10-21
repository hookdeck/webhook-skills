# Generated with: zoominfo-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ZoomInfo Webhook Handler")


def verify_zoominfo_token(token_header, expected_token) -> bool:
    """ZoomInfo does not sign payloads. It sends the verification token generated
    when you create the webhook back in the x-zoominfo-token header.
    https://tech-docs-library.zoominfo.com/webhooks-implementation-guide.pdf"""
    if not token_header or not expected_token:
        return False
    # Constant-time compare; compare bytes so non-ASCII input can't raise
    return hmac.compare_digest(token_header.encode("utf-8"), expected_token.encode("utf-8"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/zoominfo")
async def zoominfo_webhook(request: Request):
    # Raw body: read bytes first, parse only after the token check
    raw_body = await request.body()
    expected_token = os.getenv("ZOOMINFO_WEBHOOK_TOKEN")

    # The "Validate" button in ZoomInfo posts a sample payload before any token
    # exists. With no token configured we acknowledge it but do not process it.
    if not expected_token:
        logger.warning("ZOOMINFO_WEBHOOK_TOKEN is not set: acknowledging without processing")
        return {"received": True, "verified": False}

    if not verify_zoominfo_token(request.headers.get("x-zoominfo-token"), expected_token):
        logger.error("ZoomInfo webhook token verification failed")
        return JSONResponse(status_code=401, content={"error": "Invalid token"})

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # Subscriptions are an object type (Contact or Company) plus the Update
    # event. The guide does not define a payload field naming the event, so
    # route on your own subscription/endpoint and read the record fields you
    # need from the payload (up to 25 profiles per delivery).
    keys = list(payload.keys()) if isinstance(payload, dict) else []
    logger.info("Verified ZoomInfo webhook (%d bytes, keys: %s)", len(raw_body), ", ".join(keys) or "none")

    return {"received": True, "verified": True}
