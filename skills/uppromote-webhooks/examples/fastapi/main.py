import hashlib
import hmac
import json
import logging
import math
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()
logger = logging.getLogger("uppromote_webhooks")
app = FastAPI()

def verify_signature(raw_body: bytes, header: str | None, secret: str, tolerance_seconds: float = 0) -> bool:
    if not isinstance(raw_body, bytes) or not isinstance(header, str) or not secret:
        return False
    if not math.isfinite(tolerance_seconds) or tolerance_seconds < 0:
        return False
    message = raw_body
    signatures = [header]
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return any(re.fullmatch(r"[0-9a-fA-F]{64}", value) is not None
               and hmac.compare_digest(bytes.fromhex(value), expected) for value in signatures)


def get_event_names(payload: dict) -> list[str]:
    return [os.environ.get("UPPROMOTE_WEBHOOK_TOPIC") or "unconfigured-subscription"]


def handle_event(payload: dict) -> None:
    for event in get_event_names(payload):
        if event in ['referral.new', 'affiliate.approved', 'payment.paid']:
            # Add durable, idempotent business processing before acknowledging.
            logger.info("Received UpPromote event: %s", event)
        else:
            logger.info("Unhandled UpPromote event: %s", event)


@app.post("/webhooks/uppromote")
async def webhook(request: Request):
    secret = os.environ.get("UPPROMOTE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    tolerance = 0
    raw_body = await request.body()
    if not verify_signature(raw_body, request.headers.get("x-uppromote-signature"), secret, tolerance):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (ValueError, RecursionError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")
    handle_event(payload)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
