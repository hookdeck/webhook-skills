# Generated with: breakcold-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()
logger = logging.getLogger("breakcold")

SIGNATURE_PREFIX = re.compile(r"^sha256=", re.IGNORECASE)
HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")

# Deduplicate on X-Webhook-Delivery-Id. Use Redis/Postgres with a TTL in production.
processed_deliveries: set = set()


def verify_breakcold_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    timestamp_header: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Webhook-Signature = "sha256=" + hex(HMAC-SHA256(secret, f"{X-Webhook-Timestamp}.{body}")).

    The signed message is built as bytes: the timestamp header exactly as received
    (latin-1), a literal ".", then the raw body bytes. The body is never decoded.
    """
    if not signature_header or not timestamp_header or not secret:
        return False

    # Accept the value with or without the `sha256=` prefix, then validate the
    # format (64 hex chars) before decoding.
    digest = SIGNATURE_PREFIX.sub("", signature_header, count=1)
    if not HEX_DIGEST.fullmatch(digest):
        return False

    signed = b"".join([timestamp_header.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    received = bytes.fromhex(digest)  # case-insensitive; both are 32 bytes

    return hmac.compare_digest(received, expected)


def is_timestamp_fresh(
    timestamp_header: str, tolerance_seconds: float, now: Optional[float] = None
) -> bool:
    """Optional replay check. tolerance_seconds <= 0 disables it. The header is Unix seconds."""
    if not tolerance_seconds > 0:
        return True
    if not re.fullmatch(r"[0-9]+", timestamp_header or ""):
        return False
    now = time.time() if now is None else now
    return abs(now - int(timestamp_header)) <= tolerance_seconds


def _tolerance() -> float:
    try:
        return float(os.getenv("BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS", "") or 0)
    except ValueError:
        return 0


def handle_event(payload: dict) -> None:
    """Dispatch on the body's `event` field. Runs after the 2xx response."""
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "record.created":
        logger.info("[record.created] %s: %s (%s)", data.get("objectTypeName") or data.get("objectType"), data.get("name"), data.get("id"))
    elif event == "record.updated":
        logger.info("[record.updated] %s (%s) fields: %s", data.get("name"), data.get("id"), ", ".join((data.get("fields") or {}).keys()))
    elif event == "record.deleted":
        logger.info("[record.deleted] %s", data.get("id"))
    elif event in ("note.created", "note.updated", "note.deleted"):
        logger.info("[%s] note %s on record %s: %s", event, data.get("noteId"), data.get("recordId"), data.get("title"))
    elif event in ("task.created", "task.completed"):
        logger.info("[%s] task %s %r on record %s", event, data.get("taskId"), data.get("title"), data.get("recordId"))
    elif event in ("relation.added", "relation.removed"):
        logger.info("[%s] %s -> %s via %s", event, data.get("sourceRecordId"), data.get("targetRecordId"), data.get("fieldSlug"))
    elif event in ("call.linked", "call.unlinked"):
        logger.info("[%s] call %s %r on record %s", event, data.get("callId"), data.get("meetingTitle"), data.get("recordId"))
    elif event in ("file.uploaded", "file.deleted"):
        logger.info("[%s] %s on record %s", event, data.get("fileName"), data.get("recordId"))
    elif event == "webhook.test":
        logger.info("[webhook.test] %s", data.get("message"))
    else:
        logger.info("[unhandled] %s", event)


@app.post("/webhooks/breakcold")
async def breakcold_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = os.getenv("BREAKCOLD_WEBHOOK_SECRET")
    if not secret:
        logger.error("BREAKCOLD_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Raw bytes, whatever the Content-Type. Never await request.json() before verifying.
    raw_body = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp")

    # 1. VERIFY against the raw bytes.
    if not verify_breakcold_signature(raw_body, request.headers.get("x-webhook-signature"), timestamp, secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    # Opt-in replay window (off by default; see .env.example).
    if not is_timestamp_fresh(timestamp, _tolerance()):
        return JSONResponse({"error": "Timestamp outside tolerance"}, status_code=401)

    # 2. PARSE only after verification.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # 3. DEDUPE.
    delivery_id = request.headers.get("x-webhook-delivery-id") or payload.get("eventId")
    if delivery_id:
        if delivery_id in processed_deliveries:
            return {"received": True, "duplicate": True}
        processed_deliveries.add(delivery_id)

    # 4. RESPOND FAST (Breakcold times out after 10s), then process.
    background_tasks.add_task(handle_event, payload)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
