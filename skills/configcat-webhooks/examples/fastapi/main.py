# Generated with: configcat-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard base64 (padded) SHA-256 digest: 43 characters + "="
SIGNATURE_PATTERN = re.compile(r"^[A-Za-z0-9+/]{43}=$")


def compute_signature(secret: str, webhook_id: str, timestamp: str, raw_body: bytes) -> str:
    # ConfigCat signs: webhook ID + timestamp + raw body, concatenated with NO separators.
    # The message is built as bytes: header values as latin-1, body bytes exactly as received.
    message = b"".join([webhook_id.encode("latin-1"), timestamp.encode("latin-1"), raw_body])
    # The key is the whole secret (including configcat_whsk_) as UTF-8 bytes
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def verify_configcat_webhook(
    raw_body: bytes,
    webhook_id: Optional[str],
    timestamp: Optional[str],
    signature: Optional[str],
    secret: str,
    tolerance_seconds: int = 0,
    now_seconds: Optional[float] = None,
) -> Optional[str]:
    """Return None when valid, otherwise an error message."""
    if not webhook_id or not timestamp or not signature:
        return "Missing X-ConfigCat-Webhook-ID, -Timestamp or -Signature-V1 header"
    # The whole header is ONE digest. Two signing keys produce a comma-separated list and fail here.
    if not SIGNATURE_PATTERN.match(signature):
        return "Malformed signature"
    try:
        received = base64.b64decode(signature, validate=True)
    except (binascii.Error, ValueError):
        return "Malformed signature"
    # Reject non-canonical encodings (stray low bits in the last character): Hookdeck compares base64 exactly
    if base64.b64encode(received).decode("ascii") != signature:
        return "Malformed signature"

    expected = base64.b64decode(compute_signature(secret, webhook_id, timestamp, raw_body))
    if not hmac.compare_digest(received, expected):
        return "Invalid signature"

    # Opt-in replay window (off by default: Hookdeck retries and replays keep the original timestamp)
    if tolerance_seconds > 0:
        try:
            sent_at = float(timestamp)
        except ValueError:
            return "Timestamp outside tolerance"
        now = time.time() if now_seconds is None else now_seconds
        if abs(now - sent_at) > tolerance_seconds:
            return "Timestamp outside tolerance"
    return None


async def verified_body(request: Request) -> bytes:
    """Dependency: verify the signature on the raw body and return the bytes."""
    secret = os.getenv("CONFIGCAT_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()  # empty bytes for GET
    try:
        tolerance = int(os.getenv("CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    error = verify_configcat_webhook(
        raw_body,
        request.headers.get("x-configcat-webhook-id"),
        request.headers.get("x-configcat-webhook-timestamp"),
        request.headers.get("x-configcat-webhook-signature-v1"),
        secret,
        tolerance,
    )
    if error:
        raise HTTPException(status_code=401, detail=error)
    return raw_body


# ConfigCat webhooks use GET or POST (user-set); the others are accepted too
@app.api_route("/webhooks/configcat", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def configcat_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    # ConfigCat has no event types: the body is whatever template the webhook author wrote
    # (optional), e.g. {"config":"##ConfigName##","environment":"##EnvironmentName##"}.
    # Parse only after verification: JSON if it parses, else text, or empty.
    text = raw_body.decode("utf-8", errors="replace")
    body = text or None
    try:
        body = json.loads(text) if text else None
    except ValueError:
        pass  # plain text body

    webhook_id = request.headers.get("x-configcat-webhook-id")
    print(f"ConfigCat settings changed ({request.method}, webhook {webhook_id}): {body}")
    # TODO: refresh your ConfigCat client, invalidate caches, notify your team
    # Don't dedupe on X-ConfigCat-Webhook-ID: it is different for every request, including
    # ConfigCat's retries (up to 5). Keep this idempotent, e.g. refresh state rather than apply deltas.

    return {"received": True}
