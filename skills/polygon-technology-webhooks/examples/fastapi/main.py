# Generated with: polygon-technology-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Polygon Technology OMS webhook receiver for FastAPI.

OMS (stablecoin payments) signs every delivery with:

    Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>

v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw request body>", keyed with
the signingKey from POST /webhooks, used as-is (no prefix, no decoding). This
is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp header.
Reject when |now - t| > 300 seconds, in either direction.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("polygon-technology-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Polygon Technology OMS Webhook Handler")

TOLERANCE_SECONDS = 300
HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")
UNIX_SECONDS = re.compile(r"[0-9]+")


def parse_signature_header(header: Optional[str]) -> Dict[str, str]:
    """Parse "t=...,v1=..." by key (never by position)."""
    parts: Dict[str, str] = {}
    for part in (header or "").split(","):
        key, sep, value = part.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_oms_signature(
    raw_body: Union[bytes, str],
    header: Optional[str],
    signing_key: Optional[str],
    now: Optional[int] = None,
) -> bool:
    """Verify Webhook-Signature against the exact bytes OMS sent."""
    if not signing_key or not header:
        return False
    parts = parse_signature_header(header)
    timestamp, signature = parts.get("t"), parts.get("v1")
    if not timestamp or not UNIX_SECONDS.fullmatch(timestamp):
        return False
    if not signature or not HEX_SHA256.fullmatch(signature):
        return False

    # Stale and future-dated timestamps are rejected the same way.
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > TOLERANCE_SECONDS:
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(
        signing_key.encode("utf-8"), f"{timestamp}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: return the raw body only if Webhook-Signature is valid."""
    signing_key = os.environ.get("OMS_WEBHOOK_SIGNING_KEY", "")
    if not signing_key:
        logger.error("OMS_WEBHOOK_SIGNING_KEY is not set: rejecting request")
        raise HTTPException(status_code=500, detail="Webhook signing key not configured")

    # The HMAC covers the exact bytes: read them before any JSON parsing.
    raw_body = await request.body()
    if not verify_oms_signature(raw_body, request.headers.get("webhook-signature"), signing_key):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


# ---------------------------------------------------------------------------
# Delivery is at-least-once, parallel and unordered: dedupe on id AND
# idempotencyKey, and apply only events newer than the last one applied for the
# resource. createdAt (UTC, 3 fractional digits) compares correctly as text.
# In-memory stores for the demo: use a database with unique constraints.
# ---------------------------------------------------------------------------

seen_event_ids: set = set()
seen_idempotency_keys: set = set()
last_applied_at: Dict[str, str] = {}


def reset_store() -> None:
    seen_event_ids.clear()
    seen_idempotency_keys.clear()
    last_applied_at.clear()


# Sub-statuses this handler branches on. The list is open: OMS can add new ones
# without a version bump, so anything else falls back to the prefix.
KNOWN_SUB_STATUSES = {
    "processing.underReview",
    "awaitingAction.awaitingSenderAttribution",
    "awaitingAction.payoutDestinationMissing",
    "completed.settled",
}


def effective_sub_status(sub_status: Optional[str]) -> str:
    """"processing.somethingNew" -> "processing" (fallback for unknown sub-statuses)."""
    if sub_status in KNOWN_SUB_STATUSES:
        return sub_status
    return (sub_status or "").split(".", 1)[0]


RESOURCE_EVENTS = {
    f"{resource}.{change}"
    for resource in (
        "customer",
        "externalAccount",
        "counterparty",
        "customerWallet",
        "depositAddress",
        "virtualAccount",
        "cashIn",
    )
    for change in ("created", "statusChanged", "updated")
}


def handle_event(event: Dict[str, Any]) -> str:
    """Route on type, then read data.resource. Absent fields are left out, not null."""
    event_type = event.get("type")
    data = event.get("data") or {}
    resource = data.get("resource") or {}

    if event_type == "transaction.created":
        logger.info("Transaction %s created: %s", resource.get("id"), effective_sub_status(resource.get("subStatus")))
    elif event_type == "transaction.statusChanged":
        # A subStatus-only change also sends statusChanged, with previousStatus == status.
        if data.get("previousStatus") == resource.get("status"):
            logger.info("Transaction %s sub-status now %s", resource.get("id"), effective_sub_status(resource.get("subStatus")))
        else:
            logger.info(
                "Transaction %s: %s -> %s",
                resource.get("id"),
                data.get("previousStatus"),
                effective_sub_status(resource.get("subStatus")),
            )
    elif event_type == "transfer.created":
        # May arrive before its transaction.created: hold it, or GET /transactions/{transactionId}.
        logger.info("Transfer %s created", resource.get("id"))
    elif event_type == "transfer.statusChanged":
        logger.info("Transfer %s: %s -> %s", resource.get("id"), data.get("previousStatus"), resource.get("status"))
    elif event_type == "transfer.updated":
        # Late details such as a transaction hash in tracking.
        logger.info("Transfer %s updated: %s", resource.get("id"), ", ".join(data.get("changedFields") or []))
    elif event_type in RESOURCE_EVENTS:
        logger.info("%s for %s: status=%s", event_type, resource.get("id"), resource.get("status"))
    else:
        # New types can appear without a version bump: acknowledge and ignore.
        logger.info("Ignoring unknown OMS event type %s", event_type)
        return "ignored"
    return "processed"


def process_event(event: Dict[str, Any]) -> str:
    """Dedupe, order, then handle. Returns what happened to the event."""
    # schema "" marks an event written before the current format.
    if event.get("schema") != "v1":
        return "ignored"
    event_id, idem_key = event.get("id"), event.get("idempotencyKey")
    if event_id in seen_event_ids or (idem_key and idem_key in seen_idempotency_keys):
        return "duplicate"
    seen_event_ids.add(event_id)
    if idem_key:
        seen_idempotency_keys.add(idem_key)

    resource_id = ((event.get("data") or {}).get("resource") or {}).get("id")
    if resource_id:
        last = last_applied_at.get(resource_id)
        if last is not None and event.get("createdAt", "") <= last:
            return "stale"
        last_applied_at[resource_id] = event.get("createdAt", "")
    return handle_event(event)


@app.post("/webhooks/polygon-technology")
async def polygon_technology_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Respond fast (timeoutMs defaults to 5000, max 10000). In production,
    # persist the event here, return 2xx, and do slow work asynchronously.
    result = process_event(event)
    return {"received": True, "id": event.get("id"), "type": event.get("type"), "result": result}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
