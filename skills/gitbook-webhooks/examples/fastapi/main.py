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
logger = logging.getLogger("gitbook_webhooks")
app = FastAPI()

def verify_signature(raw_body: bytes, header: str | None, secret: str, tolerance_seconds: float = 0) -> bool:
    if not isinstance(raw_body, bytes) or not isinstance(header, str) or not secret:
        return False
    if not math.isfinite(tolerance_seconds) or tolerance_seconds < 0:
        return False
    message = raw_body
    parts = [part.strip() for part in header.split(",")]
    timestamps = [part[2:] for part in parts if part.startswith("t=")]
    if len(timestamps) != 1 or re.fullmatch(r"[0-9]+", timestamps[0]) is None:
        return False
    timestamp = timestamps[0]  # Preserve the exact signed text.
    if tolerance_seconds > 0:
        try:
            if abs(time.time() - float(timestamp)) > tolerance_seconds:
                return False
        except (ValueError, OverflowError):
            return False
    message = timestamp.encode("utf-8") + b"." + raw_body
    signatures = [part[3:] for part in parts if part.startswith("v1=")]
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return any(re.fullmatch(r"[0-9a-fA-F]{64}", value) is not None
               and hmac.compare_digest(bytes.fromhex(value), expected) for value in signatures)


def get_event_names(payload: dict) -> list[str]:
    event = payload.get("type")
    return [event] if isinstance(event, str) else []


def handle_event(payload: dict) -> None:
    for event in get_event_names(payload):
        if event in ['space_content_updated', 'page_feedback', 'site_view']:
            # Add durable, idempotent business processing before acknowledging.
            logger.info("Received GitBook event: %s", event)
        else:
            logger.info("Unhandled GitBook event: %s", event)


@app.post("/webhooks/gitbook")
async def webhook(request: Request):
    secret = os.environ.get("GITBOOK_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    try:
        tolerance = float(os.environ.get("GITBOOK_WEBHOOK_TOLERANCE_SECONDS") or "0")
        if not math.isfinite(tolerance) or tolerance < 0:
            raise ValueError("Invalid tolerance")
    except ValueError:
        raise HTTPException(status_code=500, detail="Invalid tolerance configuration")
    raw_body = await request.body()
    if not verify_signature(raw_body, request.headers.get("x-gitbook-signature"), secret, tolerance):
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
