# Generated with: rootfi-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

logger = logging.getLogger("rootfi-webhooks")
app = FastAPI()

# RootFi (Commenda) signs a delivery with an X-RootFi-Signature header, only when the webhook
# config has a signing_key:
#   t=<unix seconds>,v1=<hex>
# v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the signing_key as UTF-8 bytes.
# https://integrations.docs.commenda.io/documentation/concepts/webhooks

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set ROOTFI_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("ROOTFI_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "ROOTFI_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

_TS_RE = re.compile(r"[0-9]+", re.ASCII)
_HEX64_RE = re.compile(r"[0-9a-fA-F]{64}", re.ASCII)


def parse_signature_header(header: str):
    """Split on ',', trim each part, split on the first '='. Keep every v1 (several can be present
    during key rotation) and ignore other keys such as v0."""
    t = None
    v1 = []
    for part in header.split(","):
        key, sep, value = part.strip().partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_rootfi(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not v1:
        return False

    # Opt-in only: off unless ROOTFI_WEBHOOK_TOLERANCE_SECONDS > 0. t is Unix seconds.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not _TS_RE.fullmatch(t):
            return False
        if abs(time.time() - int(t)) > tolerance:
            return False

    # t stays the string from the header; the body stays raw bytes (never decoded and re-encoded).
    signed = t.encode() + b"." + raw_body
    # signing_key as UTF-8, not hex- or base64-decoded
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest().encode()
    # Exactly 64 hex chars first, then compare_digest on bytes (hex is case-insensitive, so lowercase
    # the received value). A non-ASCII header value fails the format check instead of raising.
    return any(
        _HEX64_RE.fullmatch(sig) is not None and hmac.compare_digest(sig.lower().encode(), expected)
        for sig in v1
    )


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("ROOTFI_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("ROOTFI_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_rootfi(raw_body, request.headers.get("x-rootfi-signature"), secret):
        logger.error("RootFi webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/rootfi")
async def rootfi_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {event, data}. Delivery is at least once and unordered: dedupe on the
    # X-RootFi-Webhook-Delivery-Id header (stable across retries) and upsert records.
    delivery_id = request.headers.get("x-rootfi-webhook-delivery-id")
    event = payload.get("event")
    data = _as_dict(payload.get("data"))

    if event == "DATA_MODEL_CHANGES":
        logger.info("[%s] %s %s: %s records (sync %s, company %s)", delivery_id, data.get("data_model"), data.get("type"), data.get("no_of_records"), data.get("sync_id"), data.get("company_id"))
    elif event == "SYNC_STARTED":
        logger.info("[%s] Sync %s started for company %s (%s), full sync: %s", delivery_id, data.get("sync_id"), data.get("company_id"), data.get("integration_type"), data.get("full_sync"))
    elif event == "SYNC_COMPLETED":
        logger.info("[%s] Sync %s completed with status %s (%s failed jobs)", delivery_id, data.get("sync_id"), data.get("status"), data.get("failed_jobs_count"))
    elif event == "CONNECTION_CHANGED":
        logger.info("[%s] Connection %s is now %s", delivery_id, data.get("connection_id"), data.get("status"))
    elif event == "DISCONNECT_REQUESTED":
        # Requests a disconnect only; nothing is disconnected until a dashboard user resolves it.
        logger.info("[%s] Disconnect request %s for connection %s", delivery_id, data.get("disconnect_request_id"), data.get("connection_id"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
