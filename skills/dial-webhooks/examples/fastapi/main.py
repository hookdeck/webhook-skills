import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()


def verify_dial_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 0) -> bool:
    """X-Dial-Signature is `t=<unix-seconds>,v1=<hex>`, where v1 is the hex HMAC-SHA256 of
    `{t}.{raw body}` keyed with the full signing secret (UTF-8, `whsec_` prefix included).
    A tolerance of 0 skips the timestamp check."""
    parts = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v.strip() for k, v in parts if k.strip() == "t"), "")
    sigs = [v.strip().lower() for k, v in parts if k.strip() == "v1"]
    # Cap t at 12 digits: a longer int overflows the float math below (a 500, not a 401)
    if not t.isascii() or not t.isdigit() or len(t) > 12 or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes so a non-ASCII header yields False (401) rather than a TypeError (500)
    return any(hmac.compare_digest(expected, s.encode()) for s in sigs)


def tolerance_seconds() -> int:
    """Optional replay window in seconds. Off by default: retries and replays, including
    Hookdeck's, can carry the original timestamp, so a window would reject late redeliveries.
    Set DIAL_WEBHOOK_TOLERANCE_SECONDS to a positive whole number (Dial's docs suggest 300) to
    opt in; anything else leaves the check off."""
    raw = (os.getenv("DIAL_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    return int(raw) if raw.isascii() and raw.isdigit() else 0


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/dial")
async def dial_webhook(request: Request):
    secret = os.getenv("DIAL_WEBHOOK_SECRET", "")
    signature = request.headers.get("x-dial-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Dial-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="DIAL_WEBHOOK_SECRET not configured")

    # Verify against the RAW body, never a re-serialized version
    raw_body = await request.body()
    if not verify_dial_signature(raw_body, signature, secret, tolerance_seconds()):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Dedupe on the event id (also sent as X-Dial-Event-ID): delivery is at-least-once
    event_id = event.get("id") or request.headers.get("x-dial-event-id")
    event_type = event.get("type") or request.headers.get("x-dial-event-type")
    data = event.get("data") or {}
    logger.info("Received Dial webhook: %s (%s)", event_type, event_id)

    if event_type == "message.received":
        # channel: sms | imessage | rcs | whatsapp; groupId is set for group messages
        logger.info("Inbound %s message from %s", data.get("channel"), data.get("from"))
    elif event_type == "message.status_changed":
        logger.info(
            "Message %s: delivery=%s read=%s",
            data.get("messageId"), data.get("deliveryState"), data.get("readState"),
        )
    elif event_type == "call.status_changed":
        logger.info("Call %s is now %s", data.get("callId"), (data.get("status") or {}).get("state"))
    elif event_type == "call.ended":
        logger.info("Call %s ended: %s (%ss)", data.get("callId"), data.get("status"), data.get("durationSeconds"))
    elif event_type == "call.transcribed":
        # Thin event: fetch GET /api/v1/calls/{callId} (relatedObject.url) for the transcript
        logger.info("Transcript ready for call %s", data.get("callId"))
    elif event_type == "number.status_changed":
        # version 2 payload; `ready` and `degraded` are both terminal
        logger.info("Number %s is %s", data.get("number"), data.get("status"))
    elif event_type == "webhook.ping":
        logger.info("Ping received")
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}
