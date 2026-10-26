# Generated with: quicknode-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Mapping, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Nonces of deliveries already handled (catches exact repeats). Use a database or cache with a unique index in production.
processed_nonces: set = set()

HEX_64 = re.compile(r"^[0-9a-fA-F]{64}$")


def parse_timestamp(value: str) -> Optional[float]:
    """Parse X-QN-Timestamp for the opt-in tolerance check (returns epoch seconds).

    The docs do not state the unit, so this accepts epoch seconds, epoch milliseconds
    (>= 1e11) or an ISO 8601 string.
    """
    if re.fullmatch(r"\d+(\.\d+)?", value):
        n = float(value)
        return n / 1000 if n >= 1e11 else n
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def verify_quicknode_webhook(
    raw_body: bytes,
    headers: Mapping[str, str],
    secret: Optional[str],
    tolerance_seconds: float = 0,
) -> Tuple[bool, Optional[str]]:
    """Verify a Quicknode Streams / Webhooks delivery.

    X-QN-Signature is the bare lowercase hex HMAC-SHA256, keyed with the security token (UTF-8),
    of: X-QN-Nonce + X-QN-Timestamp + raw body, concatenated with no separators.
    Returns (valid, error).
    """
    signature = headers.get("x-qn-signature")
    nonce = headers.get("x-qn-nonce")
    timestamp = headers.get("x-qn-timestamp")

    if not secret:
        return False, "No secret configured"
    if not signature or not nonce or not timestamp:
        return False, "Missing signature, nonce or timestamp header"
    # Validate the format before comparing: exactly 64 hex characters
    if not HEX_64.fullmatch(signature):
        return False, "Malformed signature"

    # Header values are encoded latin-1 and the body is used as the raw bytes received
    signed_content = b"".join([nonce.encode("latin-1"), timestamp.encode("latin-1"), raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # validated above: 32 bytes

    # Timing-safe comparison on bytes
    if not hmac.compare_digest(received, expected):
        return False, "Signature mismatch"

    if tolerance_seconds > 0:
        sent_at = parse_timestamp(timestamp)
        if sent_at is None or abs(datetime.now(timezone.utc).timestamp() - sent_at) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    return True, None


@app.post("/webhooks/quicknode")
async def quicknode_webhook(request: Request):
    secret = os.environ.get("QUICKNODE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes are required for signature verification (never await request.json())
    raw_body = await request.body()
    try:
        tolerance = float(os.environ.get("QUICKNODE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0

    valid, error = verify_quicknode_webhook(raw_body, request.headers, secret, tolerance)
    if not valid:
        print(f"Webhook verification failed: {error}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Skip a nonce we already handled successfully. This catches exact repeats (Hookdeck retries and
    # replays resend the same headers); Quicknode doesn't document whether its own retries reuse the
    # nonce, so also make processing idempotent on block number/hash and transaction hash.
    nonce = request.headers["x-qn-nonce"]
    if nonce in processed_nonces:
        return {"received": True, "duplicate": True}

    # Quicknode has no event types. Dispatch on the shape of the payload.
    # ILLUSTRATIVE shapes only: the real payload depends on your stream's dataset or webhook filter.
    if isinstance(payload, list):
        # Webhooks: array of matched items (e.g. transactions)
        print(f"Webhook delivery with {len(payload)} matched item(s)")
    elif isinstance(payload, dict) and isinstance(payload.get("data"), list) and payload.get("metadata"):
        # Streams: a batch with `data` and `metadata`
        metadata = payload["metadata"]
        print(f"Streams batch: {len(payload['data'])} item(s), dataset={metadata.get('dataset')}, network={metadata.get('network')}")
    else:
        print("Unrecognised payload shape")
    # TODO: Persist or enqueue the data, then return 2xx quickly

    processed_nonces.add(nonce)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
