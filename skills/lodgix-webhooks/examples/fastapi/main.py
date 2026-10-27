# Generated with: lodgix-webhooks skill
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
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("lodgix")
app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")
UNIX_SECONDS = re.compile(r"[0-9]+", re.ASCII)


def verify_lodgix_signature(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: str,
    tolerance_seconds: int = 0,
) -> Optional[str]:
    """Verify X-Lodgix-Signature: sha256=<hex of HMAC_SHA256(secret, "{timestamp}.{raw body}")>.

    `raw_body` must be the exact bytes received. Returns None when valid, else an error message.
    """
    if not timestamp or not signature:
        return "Missing X-Lodgix-Timestamp or X-Lodgix-Signature header"

    # Accept the value with or without the "sha256=" prefix, then validate before decoding
    digest = signature[len("sha256="):] if signature.startswith("sha256=") else signature
    if not HEX_DIGEST.fullmatch(digest):
        return "Malformed signature"

    # Signed message as bytes: timestamp header (latin-1) + "." + raw body bytes
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    if not hmac.compare_digest(bytes.fromhex(digest.lower()), expected):
        return "Signature mismatch"

    # Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
    if tolerance_seconds > 0:
        if not UNIX_SECONDS.fullmatch(timestamp):
            return "Invalid timestamp"
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return "Timestamp outside tolerance"

    return None


def _tolerance() -> int:
    try:
        return int(os.environ.get("LODGIX_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify the Lodgix signature before anything is parsed."""
    secret = os.environ.get("LODGIX_WEBHOOK_SECRET")
    if not secret:
        logger.error("LODGIX_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server misconfigured")

    raw_body = await request.body()
    error = verify_lodgix_signature(
        raw_body,
        request.headers.get("x-lodgix-timestamp"),
        request.headers.get("x-lodgix-signature"),
        secret,
        _tolerance(),
    )
    if error:
        logger.error("Lodgix signature verification failed: %s", error)
        raise HTTPException(status_code=401, detail=error)
    return raw_body


@app.post("/webhooks/lodgix")
async def lodgix_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = request.headers.get("x-lodgix-event")
    delivery_id = request.headers.get("x-lodgix-delivery")  # use for idempotency

    if event == "message.received":
        # Illustrative payload: Lodgix does not document the body shape
        logger.info("Guest message received (delivery %s): %s", delivery_id, payload)
    else:
        logger.info("Unhandled Lodgix event: %s", event)

    return {"received": True}
