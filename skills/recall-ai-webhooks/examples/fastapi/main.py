# Generated with: recall-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import time
from collections.abc import Mapping

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("recall_ai_webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Standard Webhooks recommends rejecting timestamps more than 5 minutes off.
# Recall.ai's own sample doesn't enforce a window; pass 0 to disable it.
TOLERANCE_SECONDS = 300


def get_signature_headers(headers: Mapping[str, str]) -> tuple[str | None, str | None, str | None]:
    """Pick the header set Recall.ai sent.

    Workspace verification secret -> webhook-id / webhook-timestamp / webhook-signature
    Legacy Svix endpoint secret (accounts created before 2025-12-15) -> svix-*
    """
    prefix = "webhook" if headers.get("webhook-signature") is not None else "svix"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


def verify_recall_signature(
    raw_body: bytes,
    headers: Mapping[str, str],
    secret: str | None,
    tolerance_seconds: int = TOLERANCE_SECONDS,
    now_seconds: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a Recall.ai webhook (Standard Webhooks / Svix scheme).

    Signed content: f"{id}.{timestamp}.{raw_body}" (raw bytes, not re-serialised JSON)
    Key:            base64-decoded part of the secret after "whsec_"
    Algorithm:      HMAC-SHA256, base64 digest
    Header:         space-delimited list of "v1,<base64>" (several during secret rotation)
    """
    if not secret or not secret.startswith("whsec_"):
        return False, "Verification secret is missing or not whsec_-prefixed"

    msg_id, timestamp, signature = get_signature_headers(headers)
    if not msg_id or not timestamp or not signature:
        return False, "Missing webhook-id, webhook-timestamp or webhook-signature header"

    if not re.fullmatch(r"[0-9]+", timestamp):
        return False, "Invalid timestamp"
    now = int(time.time()) if now_seconds is None else now_seconds
    if tolerance_seconds > 0 and abs(now - int(timestamp)) > tolerance_seconds:
        return False, "Timestamp outside tolerance"

    try:
        key = base64.b64decode(secret[len("whsec_"):])
    except (binascii.Error, ValueError):
        return False, "Verification secret is not valid base64"
    expected = hmac.new(
        key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256
    ).digest()

    # Accept if ANY v1 signature matches (Recall sends one per active secret after a rotation)
    for versioned in signature.split(" "):
        version, _, sig = versioned.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            sig_bytes = base64.b64decode(sig, validate=True)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(sig_bytes, expected):
            return True, None

    return False, "No matching signature found"


def handle_event(event: dict) -> None:
    event_type = event.get("event")
    data = event.get("data") or {}
    bot_id = (data.get("bot") or {}).get("id")
    status = data.get("data") or {}

    # Bot status change (Svix webhooks)
    if event_type in (
        "bot.joining_call",
        "bot.in_waiting_room",
        "bot.in_call_not_recording",
        "bot.in_call_recording",
        "bot.call_ended",
    ):
        logger.info("Bot %s status: %s", bot_id, status.get("code"))
    elif event_type == "bot.done":
        # Media is uploaded and ready to download if the bot recorded
        logger.info("Bot %s done", bot_id)
    elif event_type == "bot.fatal":
        logger.info("Bot %s fatal: %s", bot_id, status.get("sub_code"))

    # Recording and media artifact status (Svix webhooks)
    elif event_type == "recording.done":
        logger.info("Recording %s done", (data.get("recording") or {}).get("id"))
    elif event_type == "recording.failed":
        logger.info("Recording %s failed: %s", (data.get("recording") or {}).get("id"), status.get("sub_code"))
    elif event_type == "transcript.done":
        # Fetch the transcript via the API using data.transcript.id
        logger.info("Transcript %s done", (data.get("transcript") or {}).get("id"))
    elif event_type == "transcript.failed":
        logger.info("Transcript %s failed: %s", (data.get("transcript") or {}).get("id"), status.get("sub_code"))

    # Calendar V2 (Svix webhooks)
    elif event_type == "calendar.update":
        logger.info("Calendar %s updated; re-fetch it", data.get("calendar_id"))
    elif event_type == "calendar.sync_events":
        logger.info("Calendar %s events changed since %s", data.get("calendar_id"), data.get("last_updated_ts"))

    # Real-time endpoint events (configured per bot in recording_config)
    elif event_type in ("participant_events.join", "participant_events.leave"):
        logger.info("%s: %s", event_type, (status.get("participant") or {}).get("name"))
    elif event_type == "transcript.data":
        logger.info("Transcript utterance received for bot %s", bot_id)

    else:
        logger.info("Unhandled Recall.ai event: %s", event_type)


@app.post("/webhooks/recall-ai")
async def recall_ai_webhook(request: Request):
    # CRITICAL: verify the raw body; Recall.ai signed these exact bytes
    raw_body = await request.body()

    valid, error = verify_recall_signature(
        raw_body, request.headers, os.environ.get("RECALL_WEBHOOK_SECRET")
    )
    if not valid:
        logger.error("Recall.ai webhook verification failed: %s", error)
        raise HTTPException(status_code=400, detail=error)

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # webhook-id (or svix-id) is stable across retries: use it as the idempotency key.
    # In production: persist the event, return 2xx within 15s, process async.
    msg_id, _, _ = get_signature_headers(request.headers)
    logger.info("Recall.ai event %s %s", msg_id, event.get("event"))
    handle_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
