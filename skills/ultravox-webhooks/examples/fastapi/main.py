# Generated with: ultravox-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response

load_dotenv()

app = FastAPI(title="Ultravox Webhook Handler")

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_ultravox_webhook(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: str,
    tolerance_seconds: float = 0,
) -> Optional[str]:
    """Verify an Ultravox webhook. Returns None when valid, otherwise a short reason.

    Signature = lowercase hex HMAC-SHA256(secret, raw_body + X-Ultravox-Webhook-Timestamp),
    with NO separator between the body bytes and the timestamp string. The signature
    header may list several comma-separated digests (one per secret); any match is valid.
    """
    if not signature:
        return "Missing X-Ultravox-Webhook-Signature header"
    if not timestamp:
        return "Missing X-Ultravox-Webhook-Timestamp header"

    # Signed message as bytes: raw body, then the timestamp header exactly as received (latin-1)
    signed_content = b"".join([raw_body, timestamp.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()

    # The header holds one hex digest, or several separated by commas when the webhook
    # has more than one secret (key rotation). Accept the delivery if any of them matches.
    matched = False
    for candidate in signature.split(","):
        if HEX_DIGEST.fullmatch(candidate) and hmac.compare_digest(bytes.fromhex(candidate), expected):
            matched = True
            break
    if not matched:
        return "Invalid signature"

    # Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
    if tolerance_seconds > 0:
        try:
            sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return "Timestamp outside tolerance"
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        if abs((datetime.now(timezone.utc) - sent_at).total_seconds()) > tolerance_seconds:
            return "Timestamp outside tolerance"
    return None


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/ultravox")
async def ultravox_webhook(request: Request):
    secret = os.environ.get("ULTRAVOX_WEBHOOK_SECRET")
    if not secret:
        print("ULTRAVOX_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the RAW body - the signature covers these exact bytes
    raw_body = await request.body()
    try:
        tolerance = float(os.environ.get("ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0

    failure = verify_ultravox_webhook(
        raw_body,
        request.headers.get("x-ultravox-webhook-signature"),
        request.headers.get("x-ultravox-webhook-timestamp"),
        secret,
        tolerance,
    )
    if failure:
        print(f"Ultravox webhook verification failed: {failure}")
        raise HTTPException(status_code=401, detail=failure)

    # Verified - only now parse the body
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = payload.get("event") if isinstance(payload, dict) else None
    if event == "call.started":
        print("Call started")
        # Your code: record the call (fires when a call is created)
    elif event == "call.joined":
        print("Call joined")
        # Your code: a client connected to the call
    elif event == "call.ended":
        print("Call ended")
        # Your code: the call is over; billing may not be ready yet
    elif event == "call.billed":
        print("Call billed")
        # Your code: billing information is available
    else:
        print(f"Unhandled Ultravox event: {event}")

    # Ultravox recommends 204; retries on 4xx/5xx and duplicates can occur, so handle idempotently
    return Response(status_code=204)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
