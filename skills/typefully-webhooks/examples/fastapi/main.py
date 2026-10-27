# Generated with: typefully-webhooks skill
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
from fastapi import FastAPI, Header, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_str(value):
    """A JSON string field, or "" when the field is missing or another type."""
    return value if isinstance(value, str) else ""


load_dotenv()

logger = logging.getLogger("typefully-webhooks")
app = FastAPI()

# Typefully signs every delivery:
#   X-Typefully-Timestamp: <unix seconds>
#   X-Typefully-Signature: sha256=<hex>
# The signature is HMAC-SHA256 (hex) of "<X-Typefully-Timestamp>.<raw body>" keyed with the webhook secret.
# https://typefully.com/docs/api (Webhooks)

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")
_warned_invalid_tolerance = False


def tolerance_seconds() -> int:
    """Optional replay window. Off by default (0): Hookdeck's retries and replays carry the
    original timestamp (Typefully doesn't document whether its own retries do), so a window
    could reject late redeliveries.
    Set TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in."""
    global _warned_invalid_tolerance
    raw = os.getenv("TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS", "").strip()
    if raw == "":
        return 0
    if not re.fullmatch(r"[0-9]+", raw):
        if not _warned_invalid_tolerance:
            logger.warning(
                "TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


def verify_typefully(raw_body: bytes, timestamp, signature, secret: str) -> bool:
    if not secret or not timestamp or not signature:
        return False

    # The header carries "sha256=<hex>"; the bare digest is accepted too.
    digest = signature[len("sha256="):] if signature.startswith("sha256=") else signature
    if not _HEX64.fullmatch(digest):
        return False

    tolerance = tolerance_seconds()
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(int(time.time()) - int(timestamp)) > tolerance:
            return False

    # Signed message as bytes: timestamp header (latin-1) + "." + raw body. Never re-encode the body.
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    received = bytes.fromhex(digest)  # validated above, so this cannot fail
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/typefully")
async def typefully_webhook(
    request: Request,
    x_typefully_timestamp: Optional[str] = Header(default=None),
    x_typefully_signature: Optional[str] = Header(default=None),
):
    secret = os.getenv("TYPEFULLY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("TYPEFULLY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, exactly as sent. Parse the JSON only after verification.
    raw_body = await request.body()

    if not verify_typefully(raw_body, x_typefully_timestamp, x_typefully_signature, secret):
        logger.error("Typefully webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {"event": "draft.created", "data": <draft>}
    event = payload.get("event")
    draft = _as_dict(payload.get("data"))

    if event == "draft.created":
        logger.info("Draft %s created: %s", draft.get("id"), draft.get("draft_title") or _as_str(draft.get("preview")))
    elif event == "draft.scheduled":
        logger.info("Draft %s scheduled for %s", draft.get("id"), draft.get("scheduled_date"))
    elif event == "draft.published":
        logger.info("Draft %s published (%s)", draft.get("id"), draft.get("x_published_url") or "no X url")
    elif event == "draft.status_changed":
        logger.info("Draft %s status is now %s", draft.get("id"), draft.get("status"))
    elif event == "draft.deleted":
        logger.info("Draft %s deleted", draft.get("id"))
    else:
        # draft.planned, draft.tags_changed, and anything added later
        logger.info("Unhandled event: %s", event)

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
